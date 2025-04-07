// src/ghostImportantDecorations.ts

import * as vscode from 'vscode';

/**
 * ghostImportantDecorationType:
 *   เราสร้าง TextEditorDecorationType สำหรับใช้กับ DecorationOptions
 */
export const ghostImportantDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * updateImportantDecorations:
 *  - เรียกเมื่อ text เอกสารเปลี่ยน หรือ active editor เปลี่ยน
 *  - ถ้าไม่ใช่ไฟล์ .ctrl.ts => clear decoration
 *  - ถ้าใช่ => หา pattern "]!" => ใส่ ghost text "important"
 */
export function updateImportantDecorations(editor: vscode.TextEditor) {
  // 1) ถ้าไฟล์ไม่ใช่ .ctrl.ts => ล้าง decoration
  if (!editor.document.fileName.endsWith('.ctrl.ts')) {
    editor.setDecorations(ghostImportantDecorationType, []);
    return;
  }

  // 2) อ่านข้อความทั้งไฟล์
  const text = editor.document.getText();
  const lines = text.split('\n');

  // 3) regex จับ "]!"
  //    user requirement: ต้องการ “!important” ต่อท้ายเวลามี "]!"
  //    pattern = /\]!/g => match ex. "]!"
  const pattern = /\]!/g;

  const newDecorations: vscode.DecorationOptions[] = [];

  // 4) วนทุกบรรทัด
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      // match[0] = "]!"
      // match.index = ตำแหน่งเริ่มต้นของ "]!"
      // length = 2

      // เราต้องการวาง ghost text ต่อท้าย '!'
      // => offset = match.index + 2
      const startIndex = match.index + match[0].length; // match[0].length = 2

      const range = new vscode.Range(lineIndex, startIndex, lineIndex, startIndex);

      // สร้าง decoration
      const decoration: vscode.DecorationOptions = {
        range,
        renderOptions: {
          after: {
            contentText: 'important',
            fontStyle: 'italic',
            color: '#346e9e',
          },
        },
      };

      newDecorations.push(decoration);
    }
  }

  // 5) setDecorations
  editor.setDecorations(ghostImportantDecorationType, newDecorations);
}
