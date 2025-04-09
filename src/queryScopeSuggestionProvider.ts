// queryScopeSuggestionProvider.ts (standalone example)

import * as vscode from 'vscode';

export function createQueryScopeSuggestionProvider() {
  return vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescript' }, // หรือปรับตามต้องการ
    {
      provideCompletionItems(document, position, token, context) {
        // ตรวจ regex pattern "@query ... @scope."
        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.slice(0, position.character);

        const scopePattern = /@query.*@scope\.$/;
        if (!scopePattern.test(textBefore)) {
          return undefined;
        }

        // เรียก extractTopLevelClasses แบบใหม่
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

/**
 * extractTopLevelClasses - หา ".className" ที่ระดับบนสุด (braceCount == 0)
 * และ **บรรทัดนั้นต้องไม่ประกอบด้วย `@query`**.
 */
function extractTopLevelClasses(text: string): string[] {
  const lines = text.split('\n');
  let braceCount = 0;
  const result: string[] = [];

  // regex จับ className ต้นบรรทัด
  const classPattern = /^\s*\.([\w-]+)\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // เช็ค braceCount ของบรรทัดก่อน
    // (ก่อน parse บรรทัดนี้)

    // ถอด { } ในบรรทัด ออกจาก context of searching class pattern
    // แต่ note: ต้อง update braceCount หลัง parse pattern line ด้วย (เพราะ {} อาจอยู่หลัง class)

    // Step1) ลองจับ class pattern
    if (braceCount === 0) {
      // เช็คว่า line มี "@query" ไหม
      if (!line.includes('@query')) {
        // regex match .className {
        const m = line.match(classPattern);
        if (m) {
          result.push(m[1]); // เก็บชื่อคลาส
        }
      }
    }

    // Step2) นับ { } ในบรรทัดนี้
    // แบบง่ายๆ
    for (const c of line) {
      if (c === '{') braceCount++;
      if (c === '}') braceCount--;
      if (braceCount < 0) braceCount = 0;
    }
  }

  return result;
}
