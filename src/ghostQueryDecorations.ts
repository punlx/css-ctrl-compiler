// src/ghostQueryDecorations.ts
import * as vscode from 'vscode';

/**
 * ghostQueryDecorationType:
 * DecorationType สำหรับไว้แสดง ghost text "query" ตรงตำแหน่งที่กำหนด
 */
export const ghostQueryDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * updateQueryDecorations:
 * เรียกใช้เมื่อ text หรือ active editor เปลี่ยน
 * - ทำงานเฉพาะไฟล์ .ctrl.ts หรือ ctrl.theme.ts
 * - หาตำแหน่งที่เป็น '>' ซึ่งอยู่ภายใน:
 *   1) template literal ของ css`...` (หรือ css<...>`...`)
 *   2) อยู่ใน block { ... } (curly braces) ภายใน template
 *   3) ถ้าบรรทัดเดียวกันมี '> >' ติดกันโดยไม่มี whitespace คั่น => แสดง ghost text ให้เฉพาะตัวแรก
 * - จากนั้นจะวาง ghost text "query" ต่อท้ายตัว '>' จริง ๆ (เฉพาะในหน้าจอ ไม่แก้ไฟล์)
 */
export function updateQueryDecorations(editor: vscode.TextEditor) {
  if (!isCtrlOrThemeFile(editor.document.fileName)) {
    editor.setDecorations(ghostQueryDecorationType, []);
    return;
  }

  const document = editor.document;
  const fullText = document.getText();
  // หา template literal range ของ css
  const templateRanges = findCssTemplateRanges(fullText);
  // หา positions ของ '>'
  const allPositions: number[] = [];
  for (const rangeObj of templateRanges) {
    const positionsInBlock = gatherQueryGtPositionsInSubstr(fullText, rangeObj.start, rangeObj.end);
    allPositions.push(...positionsInBlock);
  }

  const decorations: vscode.DecorationOptions[] = [];
  for (const offset of allPositions) {
    // วาง ghost text หลัง '>'
    const afterOffset = offset + 1;
    const pos = document.positionAt(afterOffset);

    const decoration: vscode.DecorationOptions = {
      range: new vscode.Range(pos, pos),
      renderOptions: {
        after: {
          contentText: 'query',
          fontStyle: 'italic',
          color: 'rgb(96, 96, 96)'
        }
      }
    };
    decorations.push(decoration);
  }

  editor.setDecorations(ghostQueryDecorationType, decorations);
}

/**
 * registerAutoInsertSpaceWhenGt:
 * - ฟังก์ชันสำหรับ "ดัก" ว่าเมื่อผู้ใช้พิมพ์ '>' ในบริเวณเดียวกับเงื่อนไข ghost text
 *   ให้แทรก space ( " " ) ลงในไฟล์จริงอัตโนมัติ
 * - ควรเรียกใน extension.ts (ตอน activate) เพื่อให้ทำงานตลอด
 */
export function registerAutoInsertSpaceWhenGt(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const doc = event.document;
    if (!isCtrlOrThemeFile(doc.fileName)) {
      return;
    }

    // contentChanges อาจมีหลายรายการ ถ้า user กดทีเดียว
    if (event.contentChanges.length === 0) {
      return;
    }

    // ตรวจเฉพาะเคสผู้ใช้พิมพ์ 1 ตัวอักษร => '>'
    const change = event.contentChanges[0];
    if (change.text !== '>') {
      return;
    }

    // ตำแหน่ง offset ที่ user พิมพ์ '>'
    const offset = doc.offsetAt(change.range.start);

    // เช็คว่า offset นี้อยู่ใน positions ที่ gatherQueryGtPositionsInSubstr ได้หรือไม่
    const fullText = doc.getText();
    const templateRanges = findCssTemplateRanges(fullText);
    const validOffsets: Set<number> = new Set();
    for (const r of templateRanges) {
      const positions = gatherQueryGtPositionsInSubstr(fullText, r.start, r.end);
      positions.forEach((pos) => validOffsets.add(pos));
    }

    if (!validOffsets.has(offset)) {
      // ถ้า offset นี้ไม่อยู่ในเงื่อนไขเดียวกับ ghost text => ไม่ต้องแทรก space
      return;
    }

    // ถ้าเข้าเงื่อนไข => แทรก space ที่ offset + 1 (ต่อท้าย '>')
    const edit = new vscode.WorkspaceEdit();
    const insertPos = doc.positionAt(offset + 1);
    edit.insert(doc.uri, insertPos, ' ');
    await vscode.workspace.applyEdit(edit);
    // หมายเหตุ: เคอร์เซอร์ผู้ใช้จะยังอยู่หลัง '>' เหมือนเดิม (VSCode จะเลื่อนตาม input เดิม)
    // ถ้าอยากเลื่อน cursor ไปหลัง space => เขียน logic เพิ่มได้
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
 * - ไม่จัดการ escape \` แบบซับซ้อน
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
 * gatherQueryGtPositionsInSubstr:
 * - รับช่วง [startOffset, endOffset) แล้วนับ curly brace depth
 * - ถ้าเจอ '>' ใน depth>0 => เก็บ offset
 * - ถ้าบรรทัดเดียวมี '> >' ติดกัน (ไม่มี whitespace คั่น) => เก็บเฉพาะตัวแรก
 */
function gatherQueryGtPositionsInSubstr(fullText: string, startOffset: number, endOffset: number): number[] {
  const positions: number[] = [];
  let curlyDepth = 0;
  let offsetCursor = startOffset;

  const slice = fullText.substring(startOffset, endOffset);
  const lines = slice.split('\n');

  for (let ln = 0; ln < lines.length; ln++) {
    const lineText = lines[ln];
    let skipNextGtInLine = false;
    for (let i = 0; i < lineText.length; i++) {
      const c = lineText[i];
      if (c === '{') {
        curlyDepth++;
      } else if (c === '}') {
        if (curlyDepth > 0) {
          curlyDepth--;
        }
      } else if (c === '>') {
        if (curlyDepth > 0 && !skipNextGtInLine) {
          positions.push(offsetCursor + i);
          skipNextGtInLine = true;
        }
      } else {
        // ถ้าเจออักขระอื่นที่ไม่ใช่ whitespace => รีเซ็ต skipNextGtInLine
        if (!/\s/.test(c)) {
          skipNextGtInLine = false;
        }
      }
    }
    offsetCursor += lineText.length + 1; // +1 สำหรับ \n
  }
  return positions;
}
