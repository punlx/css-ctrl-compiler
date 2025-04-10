// src/createBorderStyleProvider.ts

import * as vscode from 'vscode';

/**
 * multiValueBorderAbbr: รายการ abbr ที่สามารถใส่ค่าได้หลาย token
 * เช่น "bd[12px solid red]", "bdl[2px dotted #333]"
 */
const multiValueBorderAbbr = ['bd', 'bdl', 'bdr', 'bdt', 'bdb', 'bdx', 'bdy', 'ol'];

/**
 * สมมติรายการที่จะแสดงเป็น suggestion สำหรับ Border-style
 * (คุณอาจใส่ค่าที่ใช้บ่อย เช่น "solid","dashed","dotted", ฯลฯ)
 */
const borderStyleList = [
  'none',
  'hidden',
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'auto',
  // จะเติม width / color อื่นๆ ก็ได้ ถ้าต้องการ
];

export function createBorderStyleProvider() {
  return vscode.languages.registerCompletionItemProvider(
    // ให้ provider ทำงานในไฟล์ .ts (หรือปรับตามโปรเจกต์)
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
        // substring ก่อน cursor
        const textBefore = lineText.slice(0, position.character);

        // regex: จับ abbr[...] โดย abbr = bd|bdl|bdr|...
        // group(1) => abbr, group(2) => partial (ข้อความหลัง '[' จนถึง cursor)
        const abbrList = multiValueBorderAbbr.join('|');
        const pattern = new RegExp(`(?:^|\\s)(${abbrList})\\[([^\\]]*)$`);

        const match = textBefore.match(pattern);
        if (!match) {
          return undefined;
        }

        // abbr = เช่น 'bd'
        // partial = เช่น '12px ' (ถ้าพิมพ์ space)
        const abbr = match[1];
        const partial = match[2] || '';

        // แยก token ด้วยช่องว่าง
        // สมมติพิมพ์ "12px " => tokens=['12px'], endsWithSpace => true
        // สมมติพิมพ์ "12px red " => tokens=['12px','red'], endsWithSpace => true
        const endsWithSpace = partial.endsWith(' ');
        const tokens = partial.trim().split(/\s+/).filter(Boolean);

        // เงื่อนไข:
        //  - tokens.length=1 และเพิ่งพิมพ์ space => suggestion (คือหลัง Value ตัวแรก)
        //  - นอกนั้น => ไม่ suggestion
        if (!(endsWithSpace && tokens.length === 1)) {
          return undefined;
        }

        // ตรงนี้ => user พิมพ์ value แรกจบ + space => show suggestion ของ border-style
        // สร้าง CompletionItem
        const items = borderStyleList.map((val) => {
          const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.Value);
          item.insertText = val;
          return item;
        });

        return items;
      },
    },
    ' ' // Trigger = spacebar
  );
}
