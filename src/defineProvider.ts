// src/defineProvider.ts

import * as vscode from 'vscode';

/**
 * createDefineProvider:
 *  - รับ defineMap = { [topKey: string]: string[] }
 *  - เช่น { button:["primary","secondary"], card:["card1","card2"] }
 *  - เมื่อ user พิมพ์ "button[" หรือ "card[" => Suggest รายชื่อ subKey
 */
export function createDefineProvider(defineMap: Record<string, string[]>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) เช็คว่าเป็น .ctrl.ts เท่านั้น
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) ข้อความก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        if (lineText.includes('$')) {
          return;
        }

        if (lineText.includes('--&')) {
          return;
        }
        // 3) จับ pattern (word)[$
        //   เช่น "button[" => match[1] = "button"
        //        "card["   => match[1] = "card"
        const match = /([\w-]+)\[$/.exec(textBeforeCursor);
        if (!match) {
          return;
        }

        const topKey = match[1]; // ex. "button"

        // 4) ดูว่ามี topKey ใน defineMap หรือไม่
        if (!defineMap[topKey]) {
          return;
        }

        // 5) Suggest subKey
        const subKeys = defineMap[topKey]; // ex. ["primary","secondary"]
        const completions: vscode.CompletionItem[] = [];

        for (const subKey of subKeys) {
          const item = new vscode.CompletionItem(subKey, vscode.CompletionItemKind.Value);
          // insertText = subKey
          item.insertText = subKey;

          // ใส่ detail / doc ถ้าต้องการ
          item.detail = `(theme.define) ${subKey}`;
          completions.push(item);
        }

        return completions;
      },
    },
    '[' // trigger character => เมื่อพิมพ์ '['
  );
}
