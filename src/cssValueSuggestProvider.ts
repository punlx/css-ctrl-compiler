// src/cssValueSuggestProvider.ts

import * as vscode from 'vscode';
import { abbrStyleMapName, cssValues, namedColorHex } from './constants';

/**
 * createCSSValueSuggestProvider:
 *  จับ pattern (\w+)\[$ => เช่น bg[ => แสดง cssValues ที่กำหนดใน constants.ts
 *  - ถ้า property เป็น "color" / "background-color" / ... => append namedColorHex
 */
export function createCSSValueSuggestProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) return;

        // 2) อ่านบรรทัด => textBeforeCursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) จับชื่อ abbr ก่อนเครื่องหมาย [
        // เช่น "bg["
        const match = /([\w-]+)\[$/.exec(textBeforeCursor);
        if (!match) return;

        const ab = match[1];
        // 4) แปลงเป็น property
        const cssProp = abbrStyleMapName[ab];
        if (!cssProp) return;

        // 5) เอาค่าปกติจาก cssValues
        const possibleValues = cssValues[cssProp] || [];

        // 6) สร้างรายการ Suggest จาก possibleValues
        const items: vscode.CompletionItem[] = possibleValues.map((val) => {
          const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.Value);
          item.detail = `CSS value for ${cssProp}`;
          item.insertText = val;
          return item;
        });

        // 7) ถ้าเป็น property ที่รองรับ “color” => append namedColorHex
        //    ตัวอย่าง: ถ้า cssProp === 'color' || cssProp.includes('color')
        if (
          cssProp === 'color' ||
          cssProp.endsWith('color') ||
          cssProp === 'fill' ||
          cssProp === 'stroke'
          // etc. แล้วแต่กรณี
        ) {
          for (const cName of Object.keys(namedColorHex)) {
            const cHex = namedColorHex[cName];
            // CompletionItemKind.Color => VSCode แสดง swatch
            const colorItem = new vscode.CompletionItem(cName, vscode.CompletionItemKind.Color);

            // detail => "#ffc0cb" => VSCode จะแสดง swatch
            colorItem.detail = cHex;
            // ใส่ doc
            colorItem.documentation = new vscode.MarkdownString(`**${cName}** => ${cHex}`);
            // insertText => cName
            colorItem.insertText = cName;

            items.push(colorItem);
          }
        }

        return items;
      },
    },
    '[' // trigger character
  );
}
