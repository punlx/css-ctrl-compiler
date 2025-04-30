// src/defineTopKeyProvider.ts

import * as vscode from 'vscode';

/**
 * createDefineTopKeyProvider:
 *  - Suggest "button", "card" (หรือ key อื่น) จาก defineMap
 *  - เงื่อนไข: อยู่ภายใน { ... } (ไม่ใช่ใน square bracket) => เหมือน property
 *  - ถ้า prefix ที่พิมพ์ สัมพันธ์กับ key => แสดง suggestion
 */
export function createDefineTopKeyProvider(defineMap: Record<string, string[]>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) เช็คว่าอยู่ใน { ... } หรือ () และไม่ได้อยู่ใน []
        const { insideCurlyOrParen, insideSquareBracket } = checkContext(document, position);
        if (!insideCurlyOrParen || insideSquareBracket) {
          return;
        }

        // 3) อ่าน prefix ที่ user พิมพ์ => เช่น "car" => suggestion "card"
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        if (lineText.includes('--&')) {
          return;
        }
        // จับคำล่าสุด: /([\w-]+)$/ => เช่น "car"
        const wordMatch = /([\w-]+)$/.exec(textBeforeCursor);
        if (!wordMatch) {
          return;
        }
        const prefix = wordMatch[1].toLowerCase();

        // 4) collect all property topKey => Object.keys(defineMap)
        //    สมมุติ ["button","card","link","xyz"] ...
        const allKeys = Object.keys(defineMap);

        // filter เฉพาะที่ขึ้นต้นด้วย prefix
        const matchedKeys = allKeys.filter((k) => k.toLowerCase().startsWith(prefix));

        // 5) สร้าง CompletionItems
        const completions: vscode.CompletionItem[] = matchedKeys.map((k) => {
          const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Constructor);
          // เวลาเลือก -> แทน prefix ด้วย k
          // => range we might specify or let VSCode do auto
          item.detail = `(theme.property) ${k}`;
          return item;
        });

        return completions;
      },
    },
    // triggerCharacters:
    // เราอาจใส่ตัวอักษร a-z, '-', หรือใช้ '.' ก็ได้
    // หรือไม่ใส่เลย -> ให้ user กด Ctrl+Space
    // หรือใส่ '*' -> (TS 5.3+ feature)
    // ตัวอย่างนี้ขอใส่ '.' กับ '-'
    '.',
    '-'
  );
}

// logic ตรวจว่าอยู่ใน { ... }
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
        if (curlyCount > 0) {
          curlyCount--;
        }
        break;
      case '(':
        parenCount++;
        break;
      case ')':
        if (parenCount > 0) {
          parenCount--;
        }
        break;
    }
  }

  const insideSquareBracket = bracketCount > 0;
  const insideCurlyOrParen = curlyCount > 0 || parenCount > 0;
  return { insideCurlyOrParen, insideSquareBracket };
}
