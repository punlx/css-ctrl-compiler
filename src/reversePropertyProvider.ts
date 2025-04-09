// src/reversePropertyProvider.ts

import * as vscode from 'vscode';
import { abbrStyleMapName } from './constants';

/**
 * สร้าง reverseMap จาก 'background-color' => 'bg', 'border' => 'bd', ฯลฯ
 * เพื่อให้เวลาผู้ใช้เลือก property แบบเต็ม จะ insert abbr ลงไปแทน
 */
const reverseMap: Record<string, string> = {};
(function buildReverseMap() {
  for (const abbr in abbrStyleMapName) {
    const propName = abbrStyleMapName[abbr];
    reverseMap[propName] = abbr;
  }
})();

/**
 * ฟังก์ชันสำหรับตรวจสอบว่า cursor ปัจจุบันอยู่ในบริบทไหน
 * - นับจำนวนการเปิด/ปิด `{}`, `()`, `[]`
 * - ต้องการให้ suggestion แสดงเมื่ออยู่ใน {} หรือ () และไม่ได้อยู่ใน []
 */
function checkContext(document: vscode.TextDocument, position: vscode.Position) {
  const textUpToPosition = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

  let bracketCount = 0; // for [ ]
  let curlyCount = 0; // for { }
  let parenCount = 0; // for ( )

  for (let i = 0; i < textUpToPosition.length; i++) {
    const char = textUpToPosition[i];

    switch (char) {
      case '[':
        bracketCount++;
        break;
      case ']':
        if (bracketCount > 0) bracketCount--;
        break;
      case '{':
        curlyCount++;
        break;
      case '}':
        if (curlyCount > 0) curlyCount--;
        break;
      case '(':
        parenCount++;
        break;
      case ')':
        if (parenCount > 0) parenCount--;
        break;
      default:
        break;
    }
  }

  const insideSquareBracket = bracketCount > 0;
  const insideCurlyOrParen = curlyCount > 0 || parenCount > 0;

  return {
    insideCurlyOrParen,
    insideSquareBracket,
  };
}

/**
 * createReversePropertyProvider():
 * - Trigger: ทำงานเมื่อพิมพ์ตัวอักษร (หรือเรียก Ctrl+Space)
 * - Logic:
 *   1) แสดง Suggest เฉพาะเมื่ออยู่ใน {} หรือ () และไม่อยู่ใน []
 *   2) ไม่แสดงในบรรทัดที่มี @use
 *   3) Suggest property ที่ขึ้นต้นด้วย prefix แล้วแทนด้วย abbr
 */
export function createReversePropertyProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // แสดงเฉพาะไฟล์ *.ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // ข้อความในบรรทัดปัจจุบัน
        const lineText = document.lineAt(position).text;

        // 1) ถ้าบรรทัดปัจจุบันมี '@use' ให้ไม่แสดง Suggest
        if (lineText.includes('@use')) {
          return;
        }

        if (lineText.includes('--&')) {
          return;
        }

        // 2) ตรวจสอบ context
        const { insideCurlyOrParen, insideSquareBracket } = checkContext(document, position);

        // ต้องอยู่ใน {} หรือ () และไม่อยู่ใน []
        if (!insideCurlyOrParen || insideSquareBracket) {
          return;
        }

        // ข้อความในบรรทัดปัจจุบันก่อน cursor
        const textBeforeCursor = lineText.substring(0, position.character);

        // ใช้ regex หาคำล่าสุดที่เป็นตัวอักษร (a-zA-Z0-9_) หรือขีด (-)
        const wordMatch = /([\w-]+)$/.exec(textBeforeCursor);
        if (!wordMatch) {
          return;
        }

        const prefix = wordMatch[1];
        if (!prefix) {
          return;
        }

        // 3) หา property name (ตัวเต็ม) ที่ขึ้นต้นด้วย prefix
        const matchingProps = Object.keys(reverseMap).filter((propName) =>
          propName.startsWith(prefix)
        );
        if (matchingProps.length === 0) {
          return;
        }

        // สร้าง CompletionItems
        return matchingProps.map((propName) => {
          const abbr = reverseMap[propName];
          const item = new vscode.CompletionItem(propName, vscode.CompletionItemKind.Property);
          item.detail = `CSS-CTRL: abbr => ${abbr}`;

          // ระบุ range ที่จะถูกแทนด้วย abbr (แทน prefix)
          const replaceRange = new vscode.Range(
            position.line,
            position.character - prefix.length,
            position.line,
            position.character
          );
          item.range = replaceRange;
          item.insertText = abbr;

          return item;
        });
      },
    }
  );
}
