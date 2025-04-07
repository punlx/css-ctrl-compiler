// src/directiveProvider.ts

import * as vscode from 'vscode';

export function createDirectiveProvider() {
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

        // 2) ข้อความก่อน cursor (เฉพาะบรรทัดนี้)
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) เช็กว่าเพิ่งพิมพ์ "@" หรือไม่
        if (!textBeforeCursor.endsWith('@')) {
          return;
        }

        // 4) ตรวจว่า position ตอนนี้อยู่ใน block ของ .xxx { ... } หรือไม่
        const isInsideClassBlock = checkIfInsideClassBlock(document, position);

        // 5) สร้าง Completion Items ตามเงื่อนไข
        const completions: vscode.CompletionItem[] = [];

        if (isInsideClassBlock) {
          // อยู่ใน .box { ... } => แสดงเฉพาะ "@use"
          const useItem = new vscode.CompletionItem('use', vscode.CompletionItemKind.Keyword);
          useItem.insertText = 'use';
          useItem.detail = 'CSS-CTRL directive (@use) inside class';

          const queryItem = new vscode.CompletionItem('query', vscode.CompletionItemKind.Keyword);
          queryItem.insertText = 'query';
          queryItem.detail = 'CSS-CTRL directive (@query) inside class';
          completions.push(useItem, queryItem);
        } else {
          // อยู่นอกบล็อก => แสดง @scope, @bind, @const
          const scopeItem = new vscode.CompletionItem('scope', vscode.CompletionItemKind.Keyword);
          scopeItem.insertText = 'scope';
          scopeItem.detail = 'CSS-CTRL Scope directive';
          completions.push(scopeItem);

          const bindItem = new vscode.CompletionItem('bind', vscode.CompletionItemKind.Keyword);
          bindItem.insertText = 'bind';
          bindItem.detail = 'CSS-CTRL Bind directive';
          completions.push(bindItem);

          const constItem = new vscode.CompletionItem('const', vscode.CompletionItemKind.Keyword);
          constItem.insertText = 'const';
          constItem.detail = 'CSS-CTRL Abbe Constant directive';
          completions.push(constItem);
        }

        return completions;
      },
    },
    '@' // trigger character
  );
}

/**
 * ฟังก์ชันช่วย: ตรวจสอบว่า Cursor อยู่ภายใน .xxx { ... } หรือไม่
 * แนวทางง่าย ๆ: วิ่งตั้งแต่เริ่มไฟล์ถึงตำแหน่ง cursor แล้วนับเปิด-ปิดปีกกาที่ match กับ .xxx {
 */
function checkIfInsideClassBlock(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const fullRange = new vscode.Range(new vscode.Position(0, 0), position);
  const textUpToCursor = document.getText(fullRange);

  // เราเก็บเฉพาะ stack ของ class block เท่านั้น (.xxx {)
  const classOpenRegex = /\.\w+\s*\{/g;
  const blockRegex = /\{|\}/g;

  let classOpenPositions: number[] = [];
  let match;

  // หาตำแหน่งที่เปิด class block
  while ((match = classOpenRegex.exec(textUpToCursor)) !== null) {
    classOpenPositions.push(match.index);
  }

  // ถ้าไม่มี class block เลย
  if (classOpenPositions.length === 0) {
    return false;
  }

  // ใช้ stack ปกติสำหรับ { } แต่นับเฉพาะที่อยู่หลัง class เปิด
  let stack = 0;
  let lastClassOpenIndex = classOpenPositions[classOpenPositions.length - 1];

  // slice เอาแค่ข้อความหลังจากเปิด .class { ล่าสุด
  const afterClassText = textUpToCursor.slice(lastClassOpenIndex);

  // นับ {} ในช่วงหลังจาก .class {
  while ((match = blockRegex.exec(afterClassText)) !== null) {
    if (match[0] === '{') {
      stack++;
    } else if (match[0] === '}') {
      stack--;
      if (stack === 0) {
        return false; // ปิดครบแล้ว
      }
    }
  }

  return stack > 0; // ยังเปิดอยู่
}
