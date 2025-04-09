// src/generateGenericProvider.ts

import * as vscode from 'vscode';

export const indentUnit = '  ';

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
  const templateContent = match[2]; // โค้ดภายใน backtick

  // ---------------------------------------------------------------------------
  // 2) เตรียมโครงสร้าง classMap / constMap
  // ---------------------------------------------------------------------------
  const classMap: Record<string, Set<string>> = {};
  const constMap: Record<string, Set<string>> = {};

  // ---------------------------------------------------------------------------
  // 3) ฟังก์ชัน parse $xxx[...] (รวม pseudo)
  // ---------------------------------------------------------------------------
  function parseStylesIntoSet(content: string, targetSet: Set<string>) {
    const pseudoFnRegex =
      /\b(hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container)\s*\(([^)]*)\)/g;
    let fnMatch: RegExpExecArray | null;

    while ((fnMatch = pseudoFnRegex.exec(content)) !== null) {
      const pseudoFn = fnMatch[1];
      const inside = fnMatch[2];

      // *** จับทั้ง `$xxx[...]` และ `--&xxx[...]` ***
      const styleMatches = [...inside.matchAll(/(\$[\w-]+|--&[\w-]+)\[/g)]
        .filter((m) => {
          const idx = m.index || 0;
          const matchText = m[1];
          // ถ้าเป็น `$xxx` แต่ข้างหน้ามี `--` ให้ skip
          if (matchText.startsWith('$') && idx >= 2 && inside.slice(idx - 2, idx) === '--') {
            return false;
          }
          return true;
        })
        .map((m) => m[1]);

      for (const styleName of styleMatches) {
        if (styleName.startsWith('$')) {
          targetSet.add(`${styleName}-${pseudoFn}`);
        } else if (styleName.startsWith('--&')) {
          const localName = styleName.slice('--&'.length);
          targetSet.add(`&${localName}`);
        }
      }
    }

    const pseudoFnRegexForRemove =
      /\b(?:hover|focus|active|focus-within|focus-visible|target|disabled|enabled|read-only|read-write|required|optional|checked|indeterminate|valid|invalid|in-range|out-of-range|placeholder-shown|default|link|visited|user-invalid|before|after|placeholder|selection|file-selector-button|first-letter|first-line|marker|backdrop|spelling-error|grammar-error|screen|container)\s*\(([^)]*)\)/g;
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
        targetSet.add(styleName);
      } else if (styleName.startsWith('--&')) {
        const localName = styleName.slice('--&'.length);
        targetSet.add(`&${localName}`);
      }
    }
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
  // 5) Parse .className { ... } => เก็บลง classMap + merge @use
  // ---------------------------------------------------------------------------

  {
    const classRegex = /\.(\w+)(?:\([^)]*\))?\s*\{([^}]*)\}/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(templateContent)) !== null) {
      const clsName = classMatch[1];
      const innerContent = classMatch[2];
  
      // --- (A) ดึง substring ของ “ทั้งบรรทัด”
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
    }
  }

  // ---------------------------------------------------------------------------
  // 6) แยก directive @scope, @bind, @const ออกจากเนื้อหา
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
      if (trimmed.startsWith('@const ')) {
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

  const finalBlock = finalLines.join('\n');
  const finalBlock2 = unifiedQueryIndent(finalBlock);

  const newStyledBlock = `${newPrefix}\`\n${finalBlock2}\n\``;
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
