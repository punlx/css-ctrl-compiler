// src/createBorderStyleProvider.ts

import * as vscode from 'vscode';

/**
 * multiValueBorderAbbr: รายการ abbr ที่สามารถใส่ค่าได้หลาย token
 * เช่น "bd[12px solid red]", "bdl[2px dotted #333]"
 */
const multiValueBorderAbbr = ['bd', 'bdl', 'bdr', 'bdt', 'bdb', 'bdx', 'bdy', 'ol'];

/**
 * รายการ values ที่จะแสดงเป็น suggestion หลัง value แรก
 * เช่น "solid", "dotted", "red", "12px", ...
 */
const multiValueBorderSuggestions = [
  'none',
  'hidden',
  'solid',
  'dotted',
  'dashed',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'auto',
];

/**
 * createBorderStyleProvider:
 * - Trigger: space ' '
 * - ตรวจจับรูปแบบ: "<anything>(bd|bdl|bdr|...)[partial"
 * - เช็ค tokens:
 *   - ถ้า tokens.length=1 + เพิ่งพิมพ์ space => Suggest
 *   - นอกนั้น => ไม่ suggest
 */
export function createBorderStyleProvider() {
  return vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescript' },
    {
      provideCompletionItems(document, position, token, context) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (
          !document.fileName.endsWith('.ctrl.ts') &&
          !document.fileName.endsWith('ctrl.theme.ts')
        ) {
          return;
        }
        // อ่านบรรทัดปัจจุบัน
        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.slice(0, position.character);

        // (A) สร้าง regex จับ abbr ใด ๆ ใน multiValueBorderAbbr => ([^\]]*)$ => partial
        // e.g.  "hover(bd[12px " => match(2)='bd', match(3)='12px '
        // สังเกต .*(bd|...)\[ => จับไม่สนว่ามี hover( หรือ before( อะไรข้างหน้า
        const abbrList = multiValueBorderAbbr.join('|');
        const pattern = new RegExp(`.*(${abbrList})\\[([^\\]]*)$`);
        // group(1) => abbr, group(2) => partial

        const match = textBefore.match(pattern);
        if (!match) {
          return undefined;
        }

        // abbr => e.g. 'bd'
        // partial => e.g. '2px ', '--gray ', ...
        const abbr = match[1];
        const partial = match[2] || '';

        // (B) split tokens
        const endsWithSpace = partial.endsWith(' ');
        const tokens = partial.trim().split(/\s+/).filter(Boolean);
        // ex. partial='2px ' => tokens=['2px'], endsWithSpace=true

        // (C) เงื่อนไข => ถ้า tokens.length=1 && endsWithSpace => Suggest
        if (!(endsWithSpace && tokens.length === 1)) {
          return undefined;
        }

        // (D) โชว์ suggestion (multiValueBorderSuggestions)
        const items: vscode.CompletionItem[] = multiValueBorderSuggestions.map((val) => {
          const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.Value);
          item.insertText = val;
          return item;
        });
        return items;
      },
    },
    ' ' // trigger บน spacebar
  );
}
