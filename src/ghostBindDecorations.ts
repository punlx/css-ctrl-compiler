// src/ghostBindDecorations.ts

import * as vscode from 'vscode';
import { getAllThemeClassKeys, getAllClasses } from './createBindClassProvider';

/**
 * ghostBindDecorationType:
 *  ใช้สำหรับเพิ่ม decoration ghost text สำหรับ class ที่มาจาก theme ใน @bind
 *  หรือถ้าไม่เจอใน local/.theme => :unknown
 */
export const ghostBindDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * updateBindDecorations:
 *  - เรียกเมื่อ text ในเอกสารเปลี่ยน หรือเปลี่ยน active text editor
 *  - ถ้าไม่ใช่ไฟล์ .ctrl.ts => เคลียร์ decoration
 *  - ถ้าเป็น .ctrl.ts:
 *    1) ใช้ getAllClasses(...) หา local classes ในไฟล์ .ctrl.ts
 *    2) ใช้ getAllThemeClassKeys() หา theme classes จาก ctrl.theme.ts
 *    3) สแกนหา @bind ... .className...
 *        - ถ้า className อยู่ใน local => ไม่ต้องแสดง ghost text
 *        - ถ้า className อยู่ใน theme => แสดง ghost text ":theme"
 *        - ไม่อยู่ทั้ง local/theme => แสดง ghost text ":unknown"
 */
export async function updateBindDecorations(editor: vscode.TextEditor) {
  const fileName = editor.document.fileName;
  if (!fileName.endsWith('.ctrl.ts')) {
    // ไม่ใช่ไฟล์ .ctrl.ts => ล้าง decoration
    editor.setDecorations(ghostBindDecorationType, []);
    return;
  }

  const text = editor.document.getText();
  const lines = text.split('\n');

  // ดึงรายชื่อ local classes จากไฟล์ .ctrl.ts นี้
  // (ฟังก์ชัน getAllClasses ถูก export จาก createBindClassProvider)
  const localClassesArray = getAllClasses(editor.document);
  const localClassSet = new Set(localClassesArray);

  // ดึงรายชื่อคลาสทั้งหมดที่มาจาก theme
  const themeClasses = await getAllThemeClassKeys();
  const themeClassSet = new Set(themeClasses);

  const decorations: vscode.DecorationOptions[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    // เช็คว่าบรรทัดนี้มี '@bind' หรือไม่
    if (!lineText.includes('@bind')) {
      continue;
    }

    // หา pattern .className
    const regex = /\.([\w-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const className = match[1];

      // เช็คลำดับความสำคัญ:
      // 1) ถ้าอยู่ใน local => ไม่ต้องโชว์ ghost text
      // 2) ถ้าอยู่ใน theme => :theme
      // 3) ไม่อยู่ local/theme => :unknown
      if (localClassSet.has(className)) {
        // local => ไม่มี ghost text => ข้าม
        continue;
      } else if (themeClassSet.has(className)) {
        // theme => :theme
        const startIndex = match.index + match[0].length;
        const range = new vscode.Range(
          lineIndex,
          startIndex,
          lineIndex,
          startIndex
        );
        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: ':theme',
              color: '#606060',
              fontStyle: 'italic'
            }
          }
        });
      } else {
        // ไม่มีทั้งใน local หรือ theme => :unknown
        const startIndex = match.index + match[0].length;
        const range = new vscode.Range(
          lineIndex,
          startIndex,
          lineIndex,
          startIndex
        );
        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: ':any',
              color: '#606060',
              fontStyle: 'italic'
            }
          }
        });
      }
    }
  }

  editor.setDecorations(ghostBindDecorationType, decorations);
}
