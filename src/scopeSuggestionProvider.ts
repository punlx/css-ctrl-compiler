// src/scopeSuggestionProvider.ts

import * as vscode from 'vscode';

export function createScopeSuggestionProvider(): vscode.Disposable {
  // กำหนดเซเลกเตอร์ เช่น รองรับภาษา TypeScript หรืออะไรก็ว่าไป
  // สมมติรองรับ ts, tsx, js, jsx
  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'typescript' },
    { scheme: 'file', language: 'typescriptreact' },
    { scheme: 'file', language: 'javascript' },
    { scheme: 'file', language: 'javascriptreact' },
  ];

  // กำหนด trigger character = ' ' (space) ก็ได้
  // แต่เราควรจะเช็คในโค้ดด้วยว่าจริง ๆ คือ @scope<space>
  return vscode.languages.registerCompletionItemProvider(
    selector,
    {
      provideCompletionItems(document, position) {
        // (A) ดึงข้อความของบรรทัดปัจจุบัน
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.slice(0, position.character);

        // (B) เช็คว่าจบด้วย "@scope " (มี space ต่อท้าย)
        //    เช่น "...@scope "
        if (/\@scope\s*$/.test(textBeforeCursor)) {
          // (C) สร้าง list ของ suggestion
          const suggestions: vscode.CompletionItem[] = [];

          // 1) "none"
          const itemNone = new vscode.CompletionItem('none', vscode.CompletionItemKind.Enum);
          itemNone.detail = 'Use @scope none => no prefix or unique scope';
          suggestions.push(itemNone);

          // 3) "<name>"
          const itemCustom = new vscode.CompletionItem('<name>', vscode.CompletionItemKind.Snippet);
          itemCustom.detail = 'Use custom scope name => ex. "app", "button" etc.';
          // อาจทำ snippet ให้เคอร์เซอร์ไปอยู่ภายใน <name>
          // เช่น:
          itemCustom.insertText = new vscode.SnippetString('${1:myScope}');
          suggestions.push(itemCustom);

          return suggestions;
        }

        // (D) ถ้าไม่ใช่กรณี "@scope " => ไม่ต้องคืน suggestion อะไร
        return undefined;
      },
    },
    ' ' // trigger ที่ space
  );
}
