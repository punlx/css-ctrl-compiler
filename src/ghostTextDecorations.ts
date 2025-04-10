// src/ghostTextDecorations.ts

import * as vscode from 'vscode';
import { abbrStyleMapName } from './constants';

/**
 * ghostDecorationType:
 * เราสร้าง TextEditorDecorationType ไว้ 1 ตัว
 * เพื่อใช้กับทุก ๆ DecorationOptions ที่เราสร้าง
 */
export const ghostDecorationType = vscode.window.createTextEditorDecorationType({
  // เราสามารถกำหนด style คร่าว ๆ ที่นี่ได้
  // เช่น `after: { color: '#999' }`
  // แต่ในตัวอย่าง เราจะใส่ renderOptions ส่วนใหญ่ขณะสร้าง DecorationOptions อีกที
});

/**
 * updateDecorations:
 * เรียกใช้ทุกครั้งที่เอกสารเปลี่ยนหรือเปลี่ยน active editor
 * - ถ้าไม่ใช่ไฟล์ .ctrl.ts => ล้าง decoration
 * - ถ้าใช่ => หาคำ abbr[...] ด้วย regex => ตรงกับ abbrMap => สร้าง DecorationOptions
 */
export function updateDecorations(editor: vscode.TextEditor) {
  // สมมุติเราต้องการให้โชว์ ghost text เฉพาะไฟล์ .ctrl.ts
  if (
    !editor.document.fileName.endsWith('.ctrl.ts') &&
    !editor.document.fileName.endsWith('ctrl.theme.ts')
  ) {
    // ถ้าไม่ใช่ => เคลียร์ decoration
    editor.setDecorations(ghostDecorationType, []);
    return;
  }

  // อ่าน text ทั้งไฟล์
  const text = editor.document.getText();
  const lines = text.split('\n');

  // regex จับ pattern เช่น "bg[", "jc[", ...
  const pattern = /([\w-]+)\[/g;

  const newDecorations: vscode.DecorationOptions[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      const abbr = match[1]; // เช่น 'bg'
      const startIndex = match.index; // ตำแหน่งภายในบรรทัด

      // เช็คว่ามีใน abbrMap หรือไม่
      if (abbrStyleMapName[abbr]) {
        const propFull = `:${abbrStyleMapName[abbr]}`; // เช่น 'background-color'

        // เราอยากให้ ghost text ปรากฏ "ต่อท้าย" abbr => ตำแหน่ง = abbr.length
        // lineIndex = บรรทัด, column = startIndex + abbr.length
        const range = new vscode.Range(
          lineIndex,
          startIndex + abbr.length,
          lineIndex,
          startIndex + abbr.length
        );

        // สร้าง DecorationOptions
        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              // ข้อความ ghost
              contentText: propFull,
              // สไตล์เพิ่มเติม
              fontStyle: 'italic', // ตัวเอียง
              color: '#606060', // เทาอ่อน
            },
          },
        };

        newDecorations.push(decoration);
      }
    }
  }

  // สั่ง editor.setDecorations เพื่อลง decoration ใหม่
  editor.setDecorations(ghostDecorationType, newDecorations);
}
