// src/ghostSpacingDecorations.ts

import * as vscode from 'vscode';

/**
 * ghostSpacingDecorationType:
 *  ใช้สำหรับเพิ่ม decoration ghost text สำหรับ spacing
 */
export const ghostSpacingDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * spacingMap:
 *  เก็บข้อมูล spacing จาก ctrl.theme.ts
 *  เช่น { "spacing-1":"12px", "spacing-2":"14px", "spacing-3":"16px", "spacing-4":"50%" }
 */
let spacingMap: Record<string, string> = {};

/**
 * initSpacingMap:
 *  เรียกใน extension.ts หลัง parseThemeSpacingDict(...) ได้
 *  เพื่อ set spacingMap
 */
export function initSpacingMap(dict: Record<string, string>) {
  spacingMap = dict;
}

/**
 * updateSpacingDecorations:
 *  - เรียกเมื่อ text ในเอกสารเปลี่ยน หรือเปลี่ยน active editor
 *  - ถ้าไม่ใช่ไฟล์ .ctrl.ts => เคลียร์ decoration
 *  - ถ้าเป็น .ctrl.ts => regex จับ "--xxx"
 *    แล้วถ้า xxx อยู่ใน spacingMap => แสดง ghost text ":<value>"
 */
export function updateSpacingDecorations(editor: vscode.TextEditor) {
  // 1) เช็คว่าเป็น .ctrl.ts ไหม
  if (
    !editor.document.fileName.endsWith('.ctrl.ts') &&
    !editor.document.fileName.endsWith('ctrl.theme.ts')
  ) {
    // ไม่ใช่ => ล้าง decoration
    editor.setDecorations(ghostSpacingDecorationType, []);
    return;
  }

  // 2) อ่าน text ทั้งไฟล์
  const text = editor.document.getText();
  const lines = text.split('\n');

  // 3) Regex จับ "--xxx" => group[1] = "xxx"
  const pattern = /--([\w-]+)/g;
  const newDecorations: vscode.DecorationOptions[] = [];

  // 4) วนทุกบรรทัด
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      const varName = match[1]; // "spacing-1" ...

      // ถ้ามีใน spacingMap => สร้าง ghost text
      if (spacingMap[varName]) {
        const ghostText = `:${spacingMap[varName]}`; // ex. ":12px"

        // คำนวณตำแหน่ง ghost => ต่อท้าย "--xxx"
        // match.index = ตำแหน่งเริ่ม "--"
        // match[0].length = ความยาวทั้งหมด (เช่น "--spacing-1" = 12)
        const startIndex = match.index + match[0].length;

        const range = new vscode.Range(lineIndex, startIndex, lineIndex, startIndex);

        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              contentText: ghostText,
              fontStyle: 'italic',
              color: '#86593f',
            },
          },
        };

        newDecorations.push(decoration);
      }
    }
  }

  // 5) setDecorations
  editor.setDecorations(ghostSpacingDecorationType, newDecorations);
}
