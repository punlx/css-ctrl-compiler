// src/createQueryPseudoProvider.ts

import * as vscode from 'vscode';
import { pseudoClasses, pseudoElements } from './constants';
import { pluginStatePseudos } from './generateCssCommand/constants/pluginStatesConfig';

export function createQueryPseudoProvider() {
  const allPseudos = [...pseudoClasses, ...pseudoElements, ...pluginStatePseudos];

  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 2) ตรวจเฉพาะไฟล์ .ctrl.ts (ถ้าต้องการ)
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 3) เช็ค text ก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 4) ใช้ regex (@query ...:)
        //   ตัวอย่างง่าย: ถ้าพบ "@query" + อะไรก็ได้ จบด้วย ":"
        const pattern = /@query\s+.*:$/;
        if (!pattern.test(textBeforeCursor)) {
          return;
        }

        // 5) สร้าง CompletionItem จาก allPseudos
        const completions: vscode.CompletionItem[] = [];

        for (const itemName of allPseudos) {
          const ci = new vscode.CompletionItem(itemName, vscode.CompletionItemKind.Function);

          // logic: ถ้า itemName คือ ":hover" => insert "hover"
          //        ถ้า itemName คือ "::after" => insert ":after"
          // itemName.substring(1) จะตัด ':' ตัวแรกเสมอ
          ci.insertText = itemName.substring(1);

          // ใส่ detail / doc ถ้าอยากอธิบายเพิ่ม
          ci.detail = 'CSS pseudo-class/element';

          completions.push(ci);
        }

        return completions;
      },
    },
    ':' // trigger character
  );
}
