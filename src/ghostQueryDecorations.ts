// src/ghostQueryDecorations.ts
import * as vscode from 'vscode';

/**
 * ghostDecorationType:
 * ใช้สำหรับแสดง ghost text ให้ทั้ง "query" (ของ '>') และ "parent" (ของ '<')
 */
export const ghostDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * updateGhostDecorations:
 * เรียกใช้เมื่อ text หรือ active editor เปลี่ยน
 * - ทำงานเฉพาะไฟล์ .ctrl.ts หรือ ctrl.theme.ts
 * - หา template literal ของ css`...` (หรือ css<...>`...`)
 * - ใน template นั้นนับ curly brace depth เพื่อดูว่าอยู่ใน block `{ ... }`
 * - หากเจอ '>' หรือ '<' ใน depth > 0 => แสดง ghost text "query" (หลัง '>') หรือ "parent" (หลัง '<')
 * - ถ้าบรรทัดเดียวกันมี '>>' หรือต่อกัน (`> >` ไม่มี whitespace) ให้แสดงเฉพาะตัวแรก (กับ '<' ก็เช่นกัน)
 */
export function updateGhostDecorations(editor: vscode.TextEditor) {
  if (!isCtrlOrThemeFile(editor.document.fileName)) {
    // ถ้าไม่ใช่ไฟล์ .ctrl.ts หรือ .theme.ts ก็ไม่ต้องทำอะไร
    editor.setDecorations(ghostDecorationType, []);
    return;
  }

  const document = editor.document;
  const fullText = document.getText();
  // หา template literal range ของ css
  const templateRanges = findCssTemplateRanges(fullText);

  // รวม positions ของ '>' และ '<'
  // เราจะแยก positions เป็น 2 ชุด เพื่อรู้ว่าอันไหนควรแสดง query หรือ parent
  const gtOffsets: number[] = [];
  const ltOffsets: number[] = [];

  for (const rangeObj of templateRanges) {
    // หาตำแหน่ง '>' ใน block
    const positionsGt = gatherSymbolPositionsInSubstr(fullText, rangeObj.start, rangeObj.end, '>');
    gtOffsets.push(...positionsGt);

    // หาตำแหน่ง '<' ใน block
    const positionsLt = gatherSymbolPositionsInSubstr(fullText, rangeObj.start, rangeObj.end, '<');
    ltOffsets.push(...positionsLt);
  }

  // สร้าง decoration options
  const decorations: vscode.DecorationOptions[] = [];

  // สำหรับ '>'
  for (const offset of gtOffsets) {
    const afterOffset = offset + 1;
    const pos = document.positionAt(afterOffset);
    const decoration: vscode.DecorationOptions = {
      range: new vscode.Range(pos, pos),
      renderOptions: {
        after: {
          contentText: 'query',
          fontStyle: 'italic',
          color: 'rgb(133, 133, 133)',
        },
      },
    };
    decorations.push(decoration);
  }

  // สำหรับ '<'
  for (const offset of ltOffsets) {
    const afterOffset = offset + 1;
    const pos = document.positionAt(afterOffset);
    const decoration: vscode.DecorationOptions = {
      range: new vscode.Range(pos, pos),
      renderOptions: {
        after: {
          contentText: 'parent',
          fontStyle: 'italic',
          color: 'rgb(133, 133, 133)',
        },
      },
    };
    decorations.push(decoration);
  }

  // ติดตั้ง decorations ทั้งหมด
  editor.setDecorations(ghostDecorationType, decorations);
}

/**
 * registerAutoInsertSpaceWhenBracket:
 * - ฟังก์ชันสำหรับ "ดัก" ว่าเมื่อผู้ใช้พิมพ์ '>' หรือ '<'
 *   ในบริเวณเดียวกับเงื่อนไข ghost text ให้แทรก space ( " " ) ลงในไฟล์จริงอัตโนมัติ
 * - ควรเรียกใน extension.ts (ตอน activate) เพื่อให้ทำงานตลอด
 */
export function registerAutoInsertSpaceWhenBracket(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const doc = event.document;
    if (!isCtrlOrThemeFile(doc.fileName)) {
      return;
    }

    if (event.contentChanges.length === 0) {
      return;
    }

    // ตรวจเฉพาะเคสผู้ใช้พิมพ์ 1 ตัวอักษร => '>' หรือ '<'
    const change = event.contentChanges[0];
    if (change.text !== '>' && change.text !== '<') {
      return;
    }

    // ตำแหน่ง offset ที่ user พิมพ์
    const offset = doc.offsetAt(change.range.start);

    // รวบรวมตำแหน่ง '>' และ '<' ที่ valid
    const fullText = doc.getText();
    const templateRanges = findCssTemplateRanges(fullText);
    const validOffsetsGt: Set<number> = new Set();
    const validOffsetsLt: Set<number> = new Set();

    for (const r of templateRanges) {
      const gtPositions = gatherSymbolPositionsInSubstr(fullText, r.start, r.end, '>');
      gtPositions.forEach((pos) => validOffsetsGt.add(pos));

      const ltPositions = gatherSymbolPositionsInSubstr(fullText, r.start, r.end, '<');
      ltPositions.forEach((pos) => validOffsetsLt.add(pos));
    }

    // ถ้า offset นี้อยู่ใน set ของ '>' หรือ '<' => แทรก space
    // (กรณีอยากแยก logic ว่าเฉพาะ '>' หรือเฉพาะ '<' ก็ปรับ if ด้านล่างได้)
    const typedSymbol = change.text;
    const isValidGt = typedSymbol === '>' && validOffsetsGt.has(offset);
    const isValidLt = typedSymbol === '<' && validOffsetsLt.has(offset);

    if (isValidGt || isValidLt) {
      const edit = new vscode.WorkspaceEdit();
      const insertPos = doc.positionAt(offset + 1);
      edit.insert(doc.uri, insertPos, ' ');
      await vscode.workspace.applyEdit(edit);
    }
  });

  context.subscriptions.push(disposable);
}

/**
 * isCtrlOrThemeFile:
 * - เช็คว่า fileName เป็น .ctrl.ts หรือ ctrl.theme.ts หรือไม่
 */
function isCtrlOrThemeFile(fileName: string): boolean {
  return fileName.endsWith('.ctrl.ts') || fileName.endsWith('ctrl.theme.ts');
}

/**
 * findCssTemplateRanges:
 * - หาช่วงภายในไฟล์ที่เป็น template literal ของ `css` หรือ `css<...>` (แบบ naive)
 * - คืน array ของ { start, end }
 */
function findCssTemplateRanges(text: string): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  // จับกรณี css`...` หรือ css<...>`...`
  const openRegex = /(\bcss\b(?:\s*<[^>]*>)?)\s*`/g;
  let match: RegExpExecArray | null;

  while ((match = openRegex.exec(text)) !== null) {
    const startOfContent = match.index + match[0].length;
    const closeIndex = findClosingBacktick(text, startOfContent);
    if (closeIndex > startOfContent) {
      result.push({ start: startOfContent, end: closeIndex });
      openRegex.lastIndex = closeIndex + 1;
    } else {
      break;
    }
  }
  return result;
}

/**
 * findClosingBacktick:
 * - หา backtick ปิดตั้งแต่ start
 * - ไม่ได้จัดการ escape \` แบบซับซ้อน (naive)
 */
function findClosingBacktick(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '`') {
      return i;
    }
  }
  return -1;
}

/**
 * gatherSymbolPositionsInSubstr:
 * - รับช่วง [startOffset, endOffset) แล้วนับ curly brace depth
 * - ถ้าเจอ symbol ('>' หรือ '<') ใน depth>0 => เก็บ offset
 * - ถ้าบรรทัดเดียวมี symbol ติดกัน (เช่น `>>`, `<<`) โดยไม่มี whitespace คั่น => เก็บเฉพาะตัวแรก
 *   (ปรับ logic เดิมของ '> >' มาเป็นกลาง)
 */
function gatherSymbolPositionsInSubstr(
  fullText: string,
  startOffset: number,
  endOffset: number,
  symbol: '>' | '<'
): number[] {
  const positions: number[] = [];
  let curlyDepth = 0;
  let offsetCursor = startOffset;

  const slice = fullText.substring(startOffset, endOffset);
  const lines = slice.split('\n');

  for (const lineText of lines) {
    let skipNextSymbolInLine = false;

    for (let i = 0; i < lineText.length; i++) {
      const c = lineText[i];
      if (c === '{') {
        curlyDepth++;
      } else if (c === '}') {
        if (curlyDepth > 0) {
          curlyDepth--;
        }
      } else if (c === symbol) {
        if (curlyDepth > 0 && !skipNextSymbolInLine) {
          positions.push(offsetCursor + i);
          skipNextSymbolInLine = true;
        }
      } else {
        // ถ้าเจออักขระอื่นที่ไม่ใช่ whitespace => รีเซ็ต skipNextSymbolInLine
        if (!/\s/.test(c)) {
          skipNextSymbolInLine = false;
        }
      }
    }
    offsetCursor += lineText.length + 1; // +1 สำหรับ \n
  }
  return positions;
}
