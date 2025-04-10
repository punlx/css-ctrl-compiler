// src/createUseConstProvider.ts

import * as vscode from 'vscode';

export function createUseConstProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) ใช้เฉพาะ .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) ตรวจว่าอยู่ใน block .xxx { ... } หรือไม่
        // if (!isInsideClassBlock(document, position)) {
        //   return;
        // }

        // 3) อ่านบรรทัดปัจจุบัน
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 4) เช็คว่ามี "@use" ก่อน cursor หรือไม่
        //    ถ้าไม่มี => ไม่ต้อง suggest
        if (!textBeforeCursor.includes('@use')) {
          return;
        }

        // 5) หา constName ทั้งหมดจาก @const ...
        const allConstNames = findAllConstNames(document);

        // 6) หา const-name ที่ผู้ใช้พิมพ์ไปแล้วบนบรรทัดนี้
        //    เช่น "@use bgRed bgBlue" -> usedConstNames = ["bgRed", "bgBlue"]
        const usedConstNames = extractUsedConstNames(lineText);

        // 7) กรองออก constName ที่ถูกใช้ไปแล้ว
        const remaining = allConstNames.filter((c) => !usedConstNames.includes(c));

        // 8) สร้าง Completion Items
        const completions: vscode.CompletionItem[] = [];
        for (const cName of remaining) {
          const item = new vscode.CompletionItem(cName, vscode.CompletionItemKind.Variable);
          item.insertText = cName;
          item.detail = 'Css-CTRL @const directive name';
          completions.push(item);
        }

        return completions;
      },
    },
    ' ' // trigger character = space (จะทำให้หลังเคาะ space ยังมี suggestion)
    // จะใส่ตัวอื่นด้วยก็ได้ เช่น '.', '-', etc.
  );
}

/**
 * ตรวจว่า Cursor อยู่ภายในบล็อก .xxx { ... } หรือไม่ (Stack-based)
 */
function isInsideClassBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
  const upToCursorRange = new vscode.Range(new vscode.Position(0, 0), position);
  const textUpToCursor = document.getText(upToCursorRange);

  let stack = 0;
  // ใช้ Regex จับ ".xxx {" กับ "}"
  const regex = /(\.\w+\s*\{)|(\})/g;
  let m;
  while ((m = regex.exec(textUpToCursor)) !== null) {
    if (m[1]) {
      stack++;
    } else if (m[2]) {
      if (stack > 0) {
        stack--;
      }
    }
  }
  return stack > 0;
}

/**
 * หา constName ในไฟล์ เช่น @const bgRed { ... }
 */
function findAllConstNames(document: vscode.TextDocument): string[] {
  const text = document.getText();
  // จับ @const ชื่อ {...}
  const regex = /^\s*@const\s+([\w-]+)\s*\{/gm;
  const result: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    result.push(match[1]);
  }
  return result;
}

/**
 * หา const-name ที่ใช้งานไปแล้วในบรรทัดเดียวกัน
 * สมมุติว่าเราดูทุกอย่างที่ตามหลัง "@use" บนบรรทัดนั้น
 * แล้ว split space -> ได้รายการคำ
 * เช่น "@use bgRed bgBlue" -> ["bgRed","bgBlue"]
 */
function extractUsedConstNames(lineText: string): string[] {
  // ก่อนอื่น ต้องหาว่ามี @use ตรงไหนบ้าง
  // สมมุติว่าอาจมีหลายจุด (แต่ส่วนใหญ่คงมีครั้งเดียว)
  // แนวทางง่าย ๆ: ดึง substring หลัง "@use "
  let usedNames: string[] = [];

  // Regex: /@use\s+([^\{]*)/g => เพื่อจับชุดคำหลัง @use จนกว่าจะเจอ { หรือ ; หรือจบ string
  // หรือจะแบบง่าย: .split("@use") วน loop filter
  const useRegex = /@use\s+([^\{\}\n]+)/g;
  let match;
  while ((match = useRegex.exec(lineText)) !== null) {
    // match[1] คือ string เช่น "bgRed bgBlue"
    const chunk = match[1];
    // split ด้วย whitespace
    const names = chunk.split(/\s+/).filter(Boolean);
    usedNames = usedNames.concat(names);
  }

  // unique
  usedNames = [...new Set(usedNames)];

  return usedNames;
}
