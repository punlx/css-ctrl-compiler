// queryScopeSuggestionProvider.ts (standalone example)

import * as vscode from 'vscode';

export function createQueryScopeSuggestionProvider() {
  return vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescript' }, 
    {
      provideCompletionItems(document, position, token, context) {
        // ตรวจ regex pattern "@query ... @scope."
        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.slice(0, position.character);

        // แก้ให้ตรวจจับ @query หรือ >
        const scopePattern = /(@query|>).*@scope\.$/;
        if (!scopePattern.test(textBefore)) {
          return undefined;
        }

        const fullText = document.getText();
        const topLevelClasses = extractTopLevelClasses(fullText);

        if (!topLevelClasses.length) {
          return undefined;
        }

        return topLevelClasses.map((cls) => {
          const item = new vscode.CompletionItem(cls, vscode.CompletionItemKind.Class);
          item.detail = 'Top-level class from this file';
          item.documentation = `Insert class "${cls}".`;
          return item;
        });
      },
    },
    '.' // trigger char
  );
}

function extractTopLevelClasses(text: string): string[] {
  const lines = text.split('\n');
  let braceCount = 0;
  const result: string[] = [];

  const classPattern = /^\s*\.([\w-]+)\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (braceCount === 0) {
      // แก้ให้เช็คว่าบรรทัดไม่มี @query และไม่มี >
      if (!line.includes('@query') && !line.includes('>')) {
        const m = line.match(classPattern);
        if (m) {
          result.push(m[1]);
        }
      }
    }

    // นับ { } เพื่อดูว่าอยู่ระดับ top-level หรือไม่
    for (const c of line) {
      if (c === '{') braceCount++;
      if (c === '}') braceCount--;
      if (braceCount < 0) braceCount = 0;
    }
  }

  return result;
}
