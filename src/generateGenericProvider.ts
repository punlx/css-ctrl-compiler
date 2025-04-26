// src/generateGenericProvider.ts

import * as vscode from 'vscode';

export const indentUnit = '  ';

// ----------------------------------------------------------
// 1) ฟังก์ชัน transformAngleBracketsLineBased:
//    สแกนบรรทัด เพื่อเปลี่ยน '>' ที่อยู่ต้นบรรทัด (หลัง trim) => "@query/*__angleN__*/"
//    โดยเก็บ N = จำนวน '>' ต่อเนื่อง
// ----------------------------------------------------------
function transformAngleBracketsLineBased(text: string): string {
  const lines = text.split('\n');
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // ถ้าบรรทัดนี้ (หลัง trim) ขึ้นต้นด้วย '>'
    // ให้นับว่ามีกี่ตัวต่อเนื่อง (เช่น ">>" => 2 ตัว)
    if (trimmed.startsWith('>')) {
      const lineIndentMatch = /^(\s*)/.exec(line);
      const lineIndent = lineIndentMatch ? lineIndentMatch[1] : '';

      let countGT = 1;
      let j = 1;
      while (j < trimmed.length && trimmed[j] === '>') {
        j++;
        countGT++;
      }
      const leftover = trimmed.slice(countGT); // ส่วนต่อจาก '>' ทั้งหมด

      // สร้างสายอักขระแทนที่:
      //  - "@query/*__angleN__*/"
      //  - ถ้ามี leftover => ใส่ต่อท้าย (พร้อมเว้นวรรคหนึ่งช่อง)
      // ตัวอย่าง: "> > div {" => "@query/*__angle2__*/ div {"
      let replacedLine = lineIndent + `@query/*__angle${countGT}__*/`;
      if (leftover) {
        replacedLine += ' ' + leftover.trimStart();
      }

      newLines.push(replacedLine);
    } else {
      // บรรทัดอื่น ไม่ยุ่ง
      newLines.push(line);
    }
  }

  return newLines.join('\n');
}

// ----------------------------------------------------------
// 2) ฟังก์ชัน revertAngleMarkerToGt:
//    หลังจากระบบ format + indent เสร็จ เราจะได้โค้ดที่มี
//    "@query/*__angleN__*/" อยู่ ให้แปลงกลับเป็น '>' N ตัว
// ----------------------------------------------------------
function revertAngleMarkerToGt(text: string): string {
  // เราจะหา pattern @query/*__angle(\d+)__*/
  // แล้วแทนที่ด้วย '>' * n
  const re = /@query\/\*__angle(\d+)__\*\//g;

  return text.replace(re, (_, digits) => {
    const n = parseInt(digits, 10);
    return '>'.repeat(n);
  });
}

// generateGeneric.ts
function generateGeneric(sourceCode: string): string {
  // ---------------------------------------------------------------------------
  // 1) หา css`...` (บล็อกแรก) ด้วย Regex ที่จับ prefix + เนื้อหาใน backtick
  // ---------------------------------------------------------------------------
  const cssRegex = /\b(css\s*(?:<[^>]*>)?)`([^`]*)`/gs;
  const match = cssRegex.exec(sourceCode);
  if (!match) return sourceCode;

  const fullMatch = match[0]; // ตัวเต็ม "css ... ` ... `"
  const prefix = match[1]; // "css" หรือ "css<...>"
  let templateContent = match[2]; // โค้ดภายใน backtick

  // ---------------------------------------------------------------------------
  // (Pass 1) Pre-process: เปลี่ยน '>' ต้นบรรทัดเป็น @query/*__angleN__*/
  // ---------------------------------------------------------------------------
  templateContent = transformAngleBracketsLineBased(templateContent);

  // ---------------------------------------------------------------------------
  // 2) เตรียมโครงสร้าง classMap / constMap / keyframeMap
  // ---------------------------------------------------------------------------
  const classMap: Record<string, Set<string>> = {};
  const constMap: Record<string, Set<string>> = {};
  const keyframeMap: Record<string, Set<string>> = {};

  // ---------------------------------------------------------------------------
  // 3) ฟังก์ชัน parse $xxx[...] (รวม pseudo)
  // ---------------------------------------------------------------------------
  function parseStylesIntoSet(content: string, targetSet: Set<string>) {
    // ---------- A) จัดการ pseudo function ----------
    const pseudoFnRegex =
      /\b(hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container|option-active|option-selected|option-unselected|option-disabled|accordion-active|accordion-expanded|accordion-collapsed|accordion-disabled)\s*\(([^)]*)\)/g;
    let fnMatch: RegExpExecArray | null;

    while ((fnMatch = pseudoFnRegex.exec(content)) !== null) {
      const pseudoFn = fnMatch[1];
      const inside = fnMatch[2];

      // หา $xxx[...] หรือ --&xxx[...]
      const styleMatches = [...inside.matchAll(/(\$[\w-]+|--&[\w-]+)\[/g)]
        .filter((m) => {
          // กรองกรณีพิเศษ: ถ้าเจอ "--$" ต่อกัน
          const idx = m.index || 0;
          const matchText = m[1];
          if (matchText.startsWith('$') && idx >= 2 && inside.slice(idx - 2, idx) === '--') {
            return false;
          }
          return true;
        })
        .map((m) => m[1]);

      // **เปลี่ยน** ให้ `$bg => "bg"`, `--&local => "local"` ก่อนค่อย + pseudoFn
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

    // ---------- B) หลังตัด pseudoFn ----------
    const pseudoFnRegexForRemove =
      /\b(?:hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container|option-active|option-selected|option-unselected|option-disabled|accordion-active|accordion-expanded|accordion-collapsed|accordion-disabled)\s*\(([^)]*)\)/g;
    const contentWithoutFn = content.replace(pseudoFnRegexForRemove, '');

    const directMatches = [...contentWithoutFn.matchAll(/(\$[\w-]+|--&[\w-]+)\[/g)]
      .filter((m) => {
        const idx = m.index || 0;
        const matchText = m[1];
        // กันกรณี match $xxx ติดหน้า '--'
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

  // ---------------------------------------------------------------------------
  // 3.1) ฟังก์ชัน parse keyframe body => ดึงทุก step, หา $xxx
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 4) Parse @const ... { ... } => ใส่ใน constMap
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 4.5) Parse @keyframe ... { ... } => ใส่ใน keyframeMap
  // ---------------------------------------------------------------------------
  {
    const keyframeRegex = /@keyframe\s+([\w-]+)\s*\{([^}]*)\}/g;
    let kMatch: RegExpExecArray | null;
    while ((kMatch = keyframeRegex.exec(templateContent)) !== null) {
      const kfName = kMatch[1];
      const kfBody = kMatch[2];
      keyframeMap[kfName] = parseKeyframeBody(kfName, kfBody);
    }
  }

  // ---------------------------------------------------------------------------
  // 5) Parse .className { ... } => เก็บลง classMap + merge @use + merge keyframe
  // ---------------------------------------------------------------------------
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

      // --- (B) ถ้ามี @query -> skip
      if (lineContent.includes('@query')) {
        continue;
      }

      // --- (C) ถ้าไม่ skip => เก็บใน classMap
      if (!classMap[clsName]) {
        classMap[clsName] = new Set();
      }

      // (C1) @use ...
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

      // (C2) parse $xxx[...] + pseudo
      parseStylesIntoSet(innerContent, classMap[clsName]);

      // (C3) ตรวจว่ามีการใช้ keyframe ไหม (am[...] หรือ am-n[...])
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

  // ---------------------------------------------------------------------------
  // 6) แยก directive @scope, @bind, @const, @keyframe ออกจากเนื้อหา
  // ---------------------------------------------------------------------------
  const lines = templateContent.split('\n');
  const scopeLines: string[] = [];
  const bindLines: string[] = [];
  const constBlocks: string[][] = [];
  const normalLines: string[] = [];

  function normalizeDirectiveLine(line: string) {
    const tokens = line.split(/\s+/).filter(Boolean);
    return tokens.join(' ');
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
      if (trimmed.startsWith('@bind ')) {
        bindLines.push(normalizeDirectiveLine(trimmed));
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

  // ---------------------------------------------------------------------------
  // 7) สร้าง Type ของ @bind => <bindKey>: []
  // ---------------------------------------------------------------------------
  const bindKeys: string[] = [];
  for (const bLine of bindLines) {
    const tokens = bLine.split(/\s+/);
    if (tokens.length > 1) {
      bindKeys.push(tokens[1]);
    }
  }
  const bindEntries = bindKeys.map((k) => `${k}: []`);

  // ---------------------------------------------------------------------------
  // 8) สร้าง entries ของ classMap
  // ---------------------------------------------------------------------------
  const classEntries = Object.keys(classMap).map((clsName) => {
    const arr = Array.from(classMap[clsName]);
    const arrLiteral = arr.map((a) => `'${a}'`).join(', ');
    return `${clsName}: [${arrLiteral}]`;
  });

  const allEntries = [...bindEntries, ...classEntries];
  const finalGeneric = `{ ${allEntries.join('; ')} }`;

  // ---------------------------------------------------------------------------
  // 9) ใส่ finalGeneric ลงใน prefix
  // ---------------------------------------------------------------------------
  let newPrefix: string;
  if (prefix.includes('<')) {
    newPrefix = prefix.replace(/<[^>]*>/, `<${finalGeneric}>`);
  } else {
    newPrefix = prefix + `<${finalGeneric}>`;
  }

  // ---------------------------------------------------------------------------
  // 10) ฟอร์แมต (@const block + .box block + directive) ตาม logic เดิม
  // ---------------------------------------------------------------------------
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
  // @scope
  for (const s of scopeLines) {
    finalLines.push(`${indentUnit}${s}`);
  }
  // @bind
  for (const b of bindLines) {
    finalLines.push(`${indentUnit}${b}`);
  }
  if (scopeLines.length > 0 || bindLines.length > 0) {
    finalLines.push('');
  }

  formattedConstBlocks.forEach((block, idx) => {
    if (idx > 0) {
      finalLines.push('');
    }
    finalLines.push(...block);
  });
  if (formattedConstBlocks.length > 0) {
    finalLines.push('');
  }

  finalLines.push(...formattedBlockLines);

  // (Pass ที่ 2.1) ได้ finalBlock หลัง format
  const finalBlock = finalLines.join('\n');

  // (Pass ที่ 2.2) จัด indent @query
  const finalBlock2 = unifiedQueryIndent(finalBlock);

  // (Pass ที่ 2.3) แปลง @query/*__angleN__*/ กลับเป็น '>' N ตัว
  const finalBlock3 = revertAngleMarkerToGt(finalBlock2);

  const newStyledBlock = `${newPrefix}\`\n${finalBlock3}\n\``;
  return sourceCode.replace(fullMatch, newStyledBlock);

  // ---------------------------------------------------------------------------
  // unifiedQueryIndent => จัดการ @query ใน pass เดียว (multi-level)
  // ---------------------------------------------------------------------------
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

export const generateGenericProvider = vscode.commands.registerCommand(
  'ctrl.generateGeneric',
  async () => {
    console.log('[DEBUG] command triggered!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active text editor');
      return;
    }

    // ตรวจว่าไฟล์ลงท้าย .ctrl.ts
    const doc = editor.document;
    if (!doc.fileName.endsWith('.ctrl.ts')) {
      return;
    }

    const fullText = doc.getText();
    const newText = generateGeneric(fullText);

    // apply edit
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length));
    edit.replace(doc.uri, fullRange, newText);
    await vscode.workspace.applyEdit(edit);
  }
);
