// src/createCssCtrlSnippetProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { indentUnit } from './generateGenericProvider';

export function createCssCtrlSnippetProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) ต้องเป็น .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) ดูคำก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) เช็กว่า token ล่าสุดเป็น "ztrl" ใช่ไหม
        if (!/\ztrl$/.test(textBeforeCursor)) {
          return;
        }

        // ดึงชื่อไฟล์มาตัด ".ctrl.ts" ออก
        const fileName = path.basename(document.fileName, '.ctrl.ts');

        // 4) สร้าง snippet
        const snippetItem = new vscode.CompletionItem(
          'create css-ctrl template',
          vscode.CompletionItemKind.Snippet
        );
        // snippet cssctrl
        snippetItem.filterText = 'ztrl'; // ให้ VSCode จับ match กับ "ztrl"

        const snippet = new vscode.SnippetString(
          `import { css } from 'css-ctrl'

export const ${fileName}css = css<{  }>\`
${indentUnit}@scope ${fileName}

${indentUnit}\${1}
\`;
`
        );

        snippetItem.insertText = snippet;
        snippetItem.detail = 'Create a CSS-CTRL template (css-ctrl)';
        snippetItem.documentation = new vscode.MarkdownString(
          'Insert a basic CSS-CTRL template snippet.'
        );

        return [snippetItem];
      },
    },
    'c'
  );
}
