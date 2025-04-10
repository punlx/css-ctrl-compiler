// src/typographyProvider.ts

import * as vscode from 'vscode';
import { abbrMap } from './generateCssCommand/constants/abbrMap';

/**
 * createFontProvider:
 *  - Suggest font name (เช่น "display-1") เมื่อพิมพ์ f[ ในไฟล์ .ctrl.ts
 *  - item.detail = ชื่อ font key
 *  - item.documentation = สร้างจากการ parse "fs[22px] fw[500]" => "font-size:22px;\nfont-weight:500;"
 */

export function createFontProvider(fontDict: Record<string, string>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // เช็คไฟล์ .ctrl.ts
        if (
          !document.fileName.endsWith('.ctrl.ts') &&
          !document.fileName.endsWith('ctrl.theme.ts')
        ) {
          return;
        }

        // ข้อความก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // ตรวจ pattern f[$
        // เช่น "ty["
        const match = /ty\[$/.exec(textBeforeCursor);
        if (!match) {
          return;
        }

        // สร้าง suggestion จาก fontDict
        const items: vscode.CompletionItem[] = [];
        for (const fontName of Object.keys(fontDict)) {
          const rawString = fontDict[fontName]; // ex. 'fs[22px] fw[500] fm[Sarabun-Bold]'
          const docString = parseFontString(rawString);

          const item = new vscode.CompletionItem(fontName, vscode.CompletionItemKind.Value);
          item.detail = fontName; // เช่น "display-1"
          item.documentation = docString; // ex. "font-size:22px;\nfont-weight:500;\nfont-family:Sarabun-Bold;"

          // เมื่อเลือก -> ใส่ fontName
          item.insertText = fontName;

          items.push(item);
        }

        return items;
      },
    },
    '[' // trigger character
  );
}

/**
 * parseFontString:
 *  - รับ string เช่น "fs[22px] fw[500] fm[Sarabun-Bold]"
 *  - แตกเป็นส่วน ๆ ด้วย space => ["fs[22px]", "fw[500]", "fm[Sarabun-Bold]"]
 *  - แต่ละส่วนเช็ค abbr => property -> doc
 *    - fs => font-size, fw => font-weight, fm => font-family
 *    - แปลง "[xxx]" -> "xxx"
 *  - คืนเป็น multi-line doc
 */
function parseFontString(raw: string): string {
  // split ด้วย space
  const chunks = raw.split(/\s+/).filter(Boolean);
  let lines: string[] = [];

  for (const ch of chunks) {
    // เช่น ch = "fs[22px]"
    const m = /^([\w-]+)\[([^\]]+)\]$/.exec(ch);
    if (!m) {
      // ถ้ารูปแบบไม่ตรง ก็ใส่ raw ไปเลย
      lines.push(ch);
      continue;
    }

    const abbr = m[1]; // fs
    const val = m[2]; // 22px

    // ใช้ abbrMap เพื่อหา property จริง เช่น fs => font-size
    const cssProp = abbrMap[abbr] || abbr;
    // ex. "font-size"
    // สร้างรูป "font-size:22px;"
    lines.push(`${cssProp}:${val};`);
  }

  // join ด้วย newline
  return lines.join('\n');
}
