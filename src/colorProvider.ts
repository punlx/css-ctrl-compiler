// src/colorProvider.ts
import * as vscode from 'vscode';
import { colorAbbrSet } from './constants';

/**
 * createColorProvider:
 * - Trigger เมื่อเจอ "--" หลัง abbr[...] เช่น "bg[--", "c[--", หรือใด ๆ
 * - ไม่เช็ค ab ใน set อีกต่อไป => ใครพิมพ์อะไรก็ตาม => Suggest color name จาก paletteMap
 * - ถ้าเจอ comment // css-ctrl mode: dark => ใช้สีจริง + swatch
 * - ถ้าไม่มี mode => แสดง icon color (ไม่มี swatch), label = colorName
 */
export function createColorProvider(paletteMap: Record<string, Record<string, string>>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (
          !document.fileName.endsWith('.ctrl.ts') &&
          !document.fileName.endsWith('ctrl.theme.ts')
        ) {
          return;
        }

        // 2) อ่านข้อความก่อน cursor เพื่อตรวจ pattern /([-\w&]+)\[.*?--$/
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) หาว่ามี comment // css-ctrl mode: X
        const docText = document.getText();
        const modeRegex = /\/\/\s*css-ctrl\s*mode:\s*(\w+)/;
        const modeMatch = modeRegex.exec(docText);
        let mode: string | undefined;
        if (modeMatch) {
          mode = modeMatch[1];
        }

        // 4) จับ ab: เช่น "bg[--", หรือ "--&test[--" ฯลฯ
        //    ที่สำคัญคือ regex /([-\w&]+)\[.*?--$/
        const abMatch = /([-\w&]+)\[.*?--$/.exec(textBeforeCursor);
        if (!abMatch) {
          return;
        }

        // *** เดิมมี code if(!colorAbbrSet.has(ab)) return; -> ลบออก
        const ab = abMatch[1];
        if (!colorAbbrSet.has(ab) && !ab.startsWith('--')) {
          return;
        }
        // 5) สร้าง CompletionItem จาก paletteMap
        const completions: vscode.CompletionItem[] = [];

        for (const colorName of Object.keys(paletteMap)) {
          let itemKind = vscode.CompletionItemKind.Color;
          let colorHex = '#CCCCCC';

          // ถ้าเจอ mode => เอาสีนั้นมาโชว์ swatch
          if (mode && paletteMap[colorName][mode]) {
            colorHex = paletteMap[colorName][mode];
          } else {
            // fallback: ถ้ามีคีย์อื่น
            const allModes = Object.keys(paletteMap[colorName]);
            if (allModes.length > 0) {
              colorHex = paletteMap[colorName][allModes[0]];
            }
          }

          // สร้าง completion item
          const item = new vscode.CompletionItem(colorName, itemKind);

          if (!mode) {
            // กรณีไม่มี mode => label = colorName, ไม่ set detail=HEX => VSCode ไม่ render swatch
            item.label = colorName;
            item.documentation = new vscode.MarkdownString(
              `No color mode specified.\n\nColor name: \`${colorName}\``
            );
          } else {
            // มี mode => แสดง swatch
            item.detail = colorHex;
            let docText = `**Color name**: \`${colorName}\`\n**Mode**: \`${mode}\`\n**Hex**: \`${colorHex}\`\n\nAll modes:\n`;
            for (const mk of Object.keys(paletteMap[colorName])) {
              docText += `- ${mk}: ${paletteMap[colorName][mk]}\n`;
            }
            item.documentation = new vscode.MarkdownString(docText);
          }

          // insertText = colorName
          item.insertText = colorName;

          completions.push(item);
        }

        return completions;
      },
    },
    '-' // trigger character = พิมพ์ '-' จะเรียก provider
  );
}
