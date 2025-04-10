// src/spacingProvider.ts

import * as vscode from 'vscode';
import { variableAbbrSet } from './constants';

/**
 * createSpacingProvider:
 * - Trigger เมื่อผู้ใช้พิมพ์ "--" ใน .ctrl.ts (ไม่เช็ค ab อีกแล้ว)
 * - จับ pattern /([-\w&]+)\[.*?--$/
 * - Suggest spacing name list จาก spacingDict
 */
export function createSpacingProvider(spacingDict: Record<string, string>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // เฉพาะไฟล์ .ctrl.ts
        if (
          !document.fileName.endsWith('.ctrl.ts') &&
          !document.fileName.endsWith('ctrl.theme.ts')
        ) {
          return;
        }

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // จับ pattern /([-\w&]+)\[.*?--$/
        // เช่น "mt[--", "--&test[--"
        const regex = /([-\w&]+)\[.*?--$/;
        const match = regex.exec(textBeforeCursor);
        if (!match) {
          return;
        }

        // *** เดิมจะเช็ค if(!spacingAbbrSet.has(ab)) return; -> ลบออก
        // => อนุญาตทุก ab
        // const ab = match[1]; // e.g. "mt", or "--&test"
        // (ไม่ต้องใช้ ab แล้ว)
        const ab = match[1]; // e.g. "mt"

        // เช็คว่า ab อยู่ใน spacingAbbrSet ไหม
        if (!variableAbbrSet.has(ab) && !ab.startsWith('--&')) {
          // ถ้าไม่ -> ไม่ต้อง suggest spacing
          return;
        }
        // Suggest spacing จาก spacingDict
        const completions: vscode.CompletionItem[] = [];

        for (const spacingName of Object.keys(spacingDict)) {
          const spacingValue = spacingDict[spacingName]; // ex. '12px'

          const item = new vscode.CompletionItem(spacingName, vscode.CompletionItemKind.Value);
          item.detail = spacingName;
          item.documentation = spacingValue;

          // insertText = spacingName
          item.insertText = spacingName;

          completions.push(item);
        }

        return completions;
      },
    },
    '-' // trigger character
  );
}
