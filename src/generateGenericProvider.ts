// src/generateGenericProvider.ts

import * as vscode from 'vscode';

// เพิ่มมาใหม่: import constants สำหรับเช็ค pseudo function
import { knownStates } from './generateCssCommand/constants/knownStates';
import { supportedPseudos } from './generateCssCommand/constants/supportedPseudos';

export const indentUnit = '  ';

function transformBracketsLineBased(text: string): string {
  const lines = text.split('\n');
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // เช็คว่าบรรทัดขึ้นต้นด้วย '>' หรือ '<'
    if (trimmed.startsWith('>') || trimmed.startsWith('<')) {
      // เว้น indent เดิม
      const lineIndentMatch = /^(\s*)/.exec(line);
      const lineIndent = lineIndentMatch ? lineIndentMatch[1] : '';
      const bracket = trimmed[0]; // '>' หรือ '<'
      let count = 1;
      let j = 1;

      // นับจำนวนตัวซ้ำ
      while (j < trimmed.length && trimmed[j] === bracket) {
        j++;
        count++;
      }

      // เนื้อหาส่วนที่เหลือหลัง bracket
      const leftover = trimmed.slice(count);

      // สร้างบรรทัดแปลงเป็น @query/*__angle>3__*/ หรือ @query/*__angle<2__*/
      let replacedLine = lineIndent + `@query/*__angle${bracket}${count}__*/`;
      if (leftover) {
        replacedLine += ' ' + leftover.trimStart();
      }
      newLines.push(replacedLine);
    } else {
      newLines.push(line);
    }
  }

  return newLines.join('\n');
}

function revertAngleMarkerToBrackets(text: string): string {
  // จับรูปแบบ @query/*__angle>3__*/ กับ @query/*__angle<2__*/
  const re = /@query\/\*__angle([><])(\d+)__\*\//g;
  return text.replace(re, (_, bracket, digits) => {
    const n = parseInt(digits, 10);
    return bracket.repeat(n);
  });
}

/**
 * formatPseudoFunctions:
 * - ฟอร์แมต pseudo function หลายบรรทัด (hover(...), focus(...), ฯลฯ)
 */
function formatPseudoFunctions(code: string): string {
  const allPseudoNames = [
    ...knownStates,
    ...supportedPseudos,
    'screen',
    'container',
    'option-active',
    'option-selected',
    'option-unselected',
    'option-disabled',
    'accordion-active',
    'accordion-expanded',
    'accordion-collapsed',
    'accordion-disabled',
  ];
  let i = 0;
  const text = code;
  const len = text.length;
  let result = '';

  while (i < len) {
    let foundIndex = -1;
    let foundName = '';
    // หา pseudoName ที่เจอก่อน
    for (const pseudoName of allPseudoNames) {
      const idx = text.indexOf(pseudoName + '(', i);
      if (idx !== -1 && (foundIndex === -1 || idx < foundIndex)) {
        foundIndex = idx;
        foundName = pseudoName;
      }
    }
    if (foundIndex === -1) {
      result += text.slice(i);
      break;
    } else {
      result += text.slice(i, foundIndex);
      const openParenPos = foundIndex + foundName.length;
      let depth = 0;
      let endParen = -1;
      for (let j = openParenPos; j < len; j++) {
        const ch = text[j];
        if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            endParen = j;
            break;
          }
        }
      }
      if (endParen === -1) {
        // กรณีหา ')' ไม่เจอ => ยกเลิก
        result += text.slice(foundIndex);
        break;
      } else {
        const inside = text.slice(openParenPos + 1, endParen);
        const prefix = text.slice(foundIndex, openParenPos + 1);
        const linesSoFar = result.split('\n');
        const lastLine = linesSoFar[linesSoFar.length - 1];
        const matchIndent = /^(\s*)/.exec(lastLine);
        const baseIndent = matchIndent ? matchIndent[1] : '';
        const formattedInside = formatInsidePseudo(inside, baseIndent + indentUnit);

        // ใส่ prefix + ขึ้นบรรทัดใหม่
        result += prefix.trimEnd() + '\n';
        result += formattedInside + '\n';
        result += baseIndent + ')';
        i = endParen + 1;
      }
    }
  }

  return result;
}

function formatInsidePseudo(content: string, indent: string): string {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const formatted = lines.map((l) => indent + l);
  return formatted.join('\n');
}

/**
 * formatKeyframeBlocks:
 * - ฟอร์แมต @keyframe someName { ... } block ให้รองรับ multi-step
 */
function formatKeyframeBlocks(code: string): string {
  const keyframeRegex = /@keyframe\s+([\w-]+)\s*\{([\s\S]*?)\}/g;
  return code.replace(keyframeRegex, (fullMatch, kfName, kfBody, offset, fullString) => {
    // หาค่า indent
    const linesBefore = fullString.substring(0, offset).split('\n');
    const lastLine = linesBefore[linesBefore.length - 1];
    const matchIndent = /^(\s*)/.exec(lastLine);
    const baseIndent = matchIndent ? matchIndent[1] : '';
    // format ส่วน body
    const formattedBody = formatKeyframeBody(kfBody, baseIndent + indentUnit);
    // ประกอบกลับ
    return `@keyframe ${kfName} {\n${formattedBody}\n${baseIndent}}`;
  });
}

function formatKeyframeBody(body: string, indent: string): string {
  let i = 0;
  const len = body.length;
  let result = '';
  let isFirstStep = true;

  while (i < len) {
    const stepRegex = /\b(from|to|\d+%)\s*\(/g;
    stepRegex.lastIndex = i;
    const match = stepRegex.exec(body);
    if (!match) {
      result += body.slice(i).trimEnd();
      break;
    }
    const foundIndex = match.index;
    const stepName = match[1];
    result += body.slice(i, foundIndex).trimEnd();

    const openParenPos = foundIndex + stepName.length;
    let depth = 0;
    let endParen = -1;
    for (let j = openParenPos; j < len; j++) {
      const ch = body[j];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          endParen = j;
          break;
        }
      }
    }
    if (endParen === -1) {
      result += body.slice(foundIndex);
      break;
    } else {
      const inside = body.slice(openParenPos + 1, endParen);
      const prefix = body.slice(foundIndex, openParenPos + 1).trim();

      if (!isFirstStep) {
        result += '\n';
      }
      result += indent + prefix + '\n';
      const formattedInside = formatInsideKeyframe(inside, indent + indentUnit);
      result += formattedInside + '\n' + indent + ')';
      isFirstStep = false;
      i = endParen + 1;
    }
  }

  // ลบช่องว่างซ้อนเกิน
  return result.replace(/\n\s*\n/g, '\n');
}

function formatInsideKeyframe(content: string, indent: string): string {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const formatted = lines.map((l) => indent + l);
  return formatted.join('\n');
}

/**
 * generateGeneric:
 * - ฟังก์ชันหลักที่อ่านโค้ด, จัดการ template `css...`, แล้วสร้าง generic < {...} >
 * - จากนั้นจัด format ให้เรียบร้อย
 */
function generateGeneric(sourceCode: string): string {
  // หา match ของ css`...` หรือ css<...>`...`
  const cssRegex = /(css\s*(?:<[^>]*>)?)\s*`([^]*?)`/gs;
  const match = cssRegex.exec(sourceCode);
  if (!match) return sourceCode;

  const fullMatch = match[0];
  const prefix = match[1]; // "css" หรือ "css<...>"
  let templateContent = match[2]; // เนื้อหาใน backtick

  // (Pass 1) เปลี่ยน '>' หรือ '<' ต้นบรรทัดเป็น @query/*__angle?N__*/
  templateContent = transformBracketsLineBased(templateContent);

  // 2) เตรียมโครงสร้าง classMap, constMap, keyframeMap, varSet
  const classMap: Record<string, Set<string>> = {};
  const constMap: Record<string, Set<string>> = {};
  const keyframeMap: Record<string, Set<string>> = {};
  const varSet: Set<string> = new Set();

  // 3) ฟังก์ชัน parse $xxx[...] + pseudo
  function parseStylesIntoSet(content: string, targetSet: Set<string>) {
    const pseudoFnRegex =
      /\b(hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container|option-active|option-selected|option-unselected|option-disabled|accordion-active|accordion-expanded|accordion-collapsed|accordion-disabled)\s*\(([^)]*)\)/g;
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = pseudoFnRegex.exec(content)) !== null) {
      const pseudoFn = fnMatch[1];
      const inside = fnMatch[2];
      // หา $xxx[...] ภายใน pseudo
      const styleMatches = [...inside.matchAll(/(\$[\w-]+|--&[\w-]+)\[/g)]
        .filter((m) => {
          const idx = m.index || 0;
          const matchText = m[1];
          if (matchText.startsWith('$') && idx >= 2 && inside.slice(idx - 2, idx) === '--') {
            // เช็คกรณี '--$xxx' => ไม่เอา
            return false;
          }
          return true;
        })
        .map((m) => m[1]);
      for (const styleName of styleMatches) {
        if (styleName.startsWith('$')) {
          const raw = styleName.slice(1);
          targetSet.add(`${raw}-${pseudoFn}`);
        } else if (styleName.startsWith('--&')) {
          const localName = styleName.slice('--&'.length);
          targetSet.add(`${localName}-${pseudoFn}`);
        }
      }
    }

    // ตัด pseudoFn ออกก่อน หา $xxx ตรง ๆ อีกที
    const pseudoFnRegexForRemove =
      /\b(?:hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container|option-active|option-selected|option-unselected|option-disabled|accordion-active|accordion-expanded|accordion-collapsed|accordion-disabled)\s*\(([^)]*)\)/g;
    const contentWithoutFn = content.replace(pseudoFnRegexForRemove, '');
    const directMatches = [...contentWithoutFn.matchAll(/(\$[\w-]+|--&[\w-]+)\[/g)]
      .filter((m) => {
        const idx = m.index || 0;
        const matchText = m[1];
        if (
          matchText.startsWith('$') &&
          idx >= 2 &&
          contentWithoutFn.slice(idx - 2, idx) === '--'
        ) {
          return false;
        }
        return true;
      })
      .map((m) => m[1]);

    for (const styleName of directMatches) {
      if (styleName.startsWith('$')) {
        targetSet.add(styleName.slice(1));
      } else if (styleName.startsWith('--&')) {
        const localName = styleName.slice('--&'.length);
        targetSet.add(localName);
      }
    }
  }

  // 3.1) ฟังก์ชัน parse keyframe body => ดึงทุก step, หา $xxx
  function parseKeyframeBody(kfName: string, body: string): Set<string> {
    const result = new Set<string>();
    const stepRegex = /(\d+)%\s*\(([^)]*)\)|(from|to)\s*\(([^)]*)\)/g;
    let mm: RegExpExecArray | null;
    while ((mm = stepRegex.exec(body)) !== null) {
      const numericStep = mm[1];
      const fromToStep = mm[3];
      const inside = mm[2] || mm[4] || '';
      const stepLabel = numericStep || fromToStep || '';
      const varRegex = /\$([\w-]+)/g;
      let varMatch: RegExpExecArray | null;
      while ((varMatch = varRegex.exec(inside)) !== null) {
        const varName = varMatch[1];
        result.add(`${kfName}_${stepLabel}_${varName}`);
      }
    }
    return result;
  }

  // 4) Parse @const ... { ... } => ใส่ใน constMap
  {
    const constRegex = /@const\s+([\w-]+)\s*\{([^}]*)\}/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = constRegex.exec(templateContent)) !== null) {
      const constName = cMatch[1];
      const constBody = cMatch[2];
      if (!constMap[constName]) {
        constMap[constName] = new Set();
      }
      parseStylesIntoSet(constBody, constMap[constName]);
    }
  }

  // 4.5) Parse @keyframe ... { ... } => ใส่ใน keyframeMap
  {
    const keyframeRegex = /@keyframe\s+([\w-]+)\s*\{([^}]*)\}/g;
    let kMatch: RegExpExecArray | null;
    while ((kMatch = keyframeRegex.exec(templateContent)) !== null) {
      const kfName = kMatch[1];
      const kfBody = kMatch[2];
      keyframeMap[kfName] = parseKeyframeBody(kfName, kfBody);
    }
  }

  // 5) Parse .className { ... }
  {
    const classRegex = /\.(\w+)(?:\([^)]*\))?\s*\{([^}]*)\}/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(templateContent)) !== null) {
      const clsName = classMatch[1];
      const innerContent = classMatch[2];
      const matchIndex = classMatch.index;
      let lineStart = templateContent.lastIndexOf('\n', matchIndex);
      if (lineStart === -1) {
        lineStart = 0;
      }
      let lineEnd = templateContent.indexOf('\n', matchIndex);
      if (lineEnd === -1) {
        lineEnd = templateContent.length;
      }
      const lineContent = templateContent.slice(lineStart, lineEnd);
      // ถ้าเจอ @query ในบรรทัด => ข้าม
      if (lineContent.includes('@query')) {
        continue;
      }
      if (!classMap[clsName]) {
        classMap[clsName] = new Set();
      }
      // parse @use ...
      {
        const useRegex = /@use\s+([^\{\}\n]+)/g;
        let useMatch: RegExpExecArray | null;
        while ((useMatch = useRegex.exec(innerContent)) !== null) {
          const usedConstsLine = useMatch[1];
          const usedConstNames = usedConstsLine.split(/\s+/).filter(Boolean);
          for (const cname of usedConstNames) {
            if (constMap[cname]) {
              for (const val of constMap[cname]) {
                classMap[clsName].add(val);
              }
            }
          }
        }
      }
      parseStylesIntoSet(innerContent, classMap[clsName]);
      // parse anim => keyframe
      {
        const animRegex = /\bam(?:-n)?\[\s*([\w-]+)/g;
        let animMatch: RegExpExecArray | null;
        while ((animMatch = animRegex.exec(innerContent)) !== null) {
          const usedKF = animMatch[1];
          if (keyframeMap[usedKF]) {
            for (const kfVal of keyframeMap[usedKF]) {
              classMap[clsName].add(kfVal);
            }
          }
        }
      }
    }
  }

  // 6) แยก directive @scope, @var, @const, @keyframe ออกจากเนื้อหา
  const lines = templateContent.split('\n');
  const scopeLines: string[] = [];
  const varLines: string[] = [];
  const constBlocks: string[][] = [];
  const normalLines: string[] = [];

  function normalizeDirectiveLine(line: string) {
    const tokens = line.split(/\s+/).filter(Boolean);
    return tokens.join(' ');
  }

  function parseVarLine(line: string): string | null {
    const m = /@var\s+([\w-]+)\s*\[/.exec(line);
    if (m) {
      return m[1];
    }
    return null;
  }

  {
    let i = 0;
    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) {
        i++;
        continue;
      }
      if (trimmed.startsWith('@scope ')) {
        scopeLines.push(normalizeDirectiveLine(trimmed));
        i++;
        continue;
      }
      if (trimmed.startsWith('@var ')) {
        varLines.push(normalizeDirectiveLine(trimmed));
        const varName = parseVarLine(trimmed);
        if (varName) {
          varSet.add(varName);
        }
        i++;
        continue;
      }
      if (trimmed.startsWith('@const ') || trimmed.startsWith('@keyframe ')) {
        const blockLines: string[] = [];
        blockLines.push(trimmed);
        i++;
        while (i < lines.length) {
          const l = lines[i].trim();
          if (!l) {
            i++;
            continue;
          }
          blockLines.push(l);
          i++;
          if (l === '}') {
            break;
          }
        }
        constBlocks.push(blockLines);
        continue;
      }
      normalLines.push(trimmed);
      i++;
    }
  }

  // 7) ไม่มี @bind แล้ว => ข้าม

  // 8) สร้าง entries ของ classMap
  const classEntries = Object.keys(classMap).map((clsName) => {
    const arr = Array.from(classMap[clsName]);
    const arrLiteral = arr.map((a) => `'${a}'`).join(', ');
    return `${clsName}: [${arrLiteral}]`;
  });

  // 8.1) varSet => var: [...]
  const varArr = Array.from(varSet);
  const varEntry = varArr.length ? `var: [${varArr.map((v) => `'${v}'`).join(', ')}]` : '';

  const allEntries = [...classEntries];
  if (varEntry) {
    allEntries.push(varEntry);
  }
  const finalGeneric = `{ ${allEntries.join('; ')} }`;

  // 9) ใส่ finalGeneric ลง prefix
  let newPrefix: string;
  if (prefix.includes('<')) {
    newPrefix = prefix.replace(/<[^>]*>/, `<${finalGeneric}>`);
  } else {
    newPrefix = prefix + `<${finalGeneric}>`;
  }

  // 10) ฟอร์แมต block (รวม directive, var, const, normalLines)
  const formattedConstBlocks: string[][] = [];
  for (const block of constBlocks) {
    const temp: string[] = [];
    let firstLine = true;
    for (const line of block) {
      if (firstLine) {
        temp.push(`${indentUnit}${line}`);
        firstLine = false;
      } else if (line === '}') {
        temp.push(`${indentUnit}${line}`);
      } else {
        temp.push(`${indentUnit}${indentUnit}${line}`);
      }
    }
    formattedConstBlocks.push(temp);
  }

  const formattedBlockLines: string[] = [];
  for (const line of normalLines) {
    let modifiedLine = line.replace(/\.(\w+)(?:\([^)]*\))?\s*\{/, (_, cName) => `.${cName} {`);
    if (/^\.\w+\s*\{/.test(modifiedLine)) {
      if (formattedBlockLines.length > 0) {
        formattedBlockLines.push('');
      }
      formattedBlockLines.push(`${indentUnit}${modifiedLine}`);
    } else if (modifiedLine === '}') {
      formattedBlockLines.push(`${indentUnit}${modifiedLine}`);
    } else {
      modifiedLine = modifiedLine.replace(/([\w-]+)\[\s*(.*?)\s*\]/g, '$1[$2]');
      formattedBlockLines.push(`${indentUnit}${indentUnit}${modifiedLine}`);
    }
  }

  const finalLines: string[] = [];

  // scope lines
  for (const s of scopeLines) {
    finalLines.push(`${indentUnit}${s}`);
  }
  if (scopeLines.length > 0) {
    finalLines.push('');
  }

  // var lines
  if (varLines.length > 0) {
    for (const vLine of varLines) {
      finalLines.push(`${indentUnit}${vLine}`);
    }
    finalLines.push('');
  }

  // const/keyframe blocks
  formattedConstBlocks.forEach((block, idx) => {
    if (idx > 0 || varLines.length === 0) {
      finalLines.push('');
    }
    finalLines.push(...block);
  });
  if (formattedConstBlocks.length > 0) {
    finalLines.push('');
  }

  // normal lines
  finalLines.push(...formattedBlockLines);

  // (Pass ที่ 2.1) ได้ finalBlock
  const finalBlock = finalLines.join('\n');

  // (Pass 2.1.1) ฟอร์แมต pseudo function
  const finalBlockPseudo = formatPseudoFunctions(finalBlock);

  // (Pass 2.1.2) ฟอร์แมต keyframe blocks
  const finalBlockKeyframes = formatKeyframeBlocks(finalBlockPseudo);

  // (Pass 2.2) จัด indent @query (ถ้าอยากเหมือนเดิมก็ใช้ unifiedQueryIndent)
  const finalBlock2 = unifiedQueryIndent(finalBlockKeyframes);

  // (Pass 2.3) แปลง placeholder กลับเป็น '<' หรือ '>'
  const finalBlock3 = revertAngleMarkerToBrackets(finalBlock2);

  // ประกอบกลับเป็น css`...\n...`
  const newStyledBlock = `${newPrefix}\`\n${finalBlock3}\n\``;

  return sourceCode.replace(fullMatch, newStyledBlock);

  // ---------------------------------------------------------------------
  // unifiedQueryIndent => จัด indent ของ @query {...} ใน pass เดียว
  // ---------------------------------------------------------------------
  function unifiedQueryIndent(code: string): string {
    const lines = code.split('\n');
    const newLines: string[] = [];
    let depth = 0;

    function countQueryOpens(line: string): number {
      const pattern = /@query\b[^{}]*\{/g;
      return (line.match(pattern) || []).length;
    }

    function countCloseBraces(line: string): number {
      return (line.match(/\}/g) || []).length;
    }

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      if (/^@query\b.*\{/.test(trimmed)) {
        if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
          newLines.push('');
        }
      }

      const matchIndent = /^(\s*)/.exec(line);
      const oldIndent = matchIndent ? matchIndent[1] : '';
      const content = line.slice(oldIndent.length);
      const newIndent = indentUnit.repeat(depth);
      line = oldIndent + newIndent + content;
      newLines.push(line);

      let openCount = countQueryOpens(line);
      while (openCount > 0) {
        depth++;
        openCount--;
      }

      let closeCount = countCloseBraces(line);
      while (closeCount > 0 && depth > 0) {
        depth--;
        closeCount--;
      }
    }

    return newLines.join('\n');
  }
}

/**
 * generateGenericProvider:
 * - คำสั่ง VSCode command 'ctrl.generateGeneric'
 * - ใช้ generateGeneric(...) บนไฟล์ .ctrl.ts ปัจจุบัน
 */
export const generateGenericProvider = vscode.commands.registerCommand(
  'ctrl.generateGeneric',
  async () => {
    console.log('[DEBUG] command triggered!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active text editor');
      return;
    }
    const doc = editor.document;
    if (!doc.fileName.endsWith('.ctrl.ts')) {
      return;
    }
    const fullText = doc.getText();
    const newText = generateGeneric(fullText);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length));
    edit.replace(doc.uri, fullRange, newText);
    await vscode.workspace.applyEdit(edit);
  }
);
