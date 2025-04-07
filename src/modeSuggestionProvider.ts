// modeSuggestionProvider.ts
import * as vscode from 'vscode';

/**
 * ตัวอย่างง่าย: สมมุติเรามี modeList ["dark","light","dim"]
 * (จริง ๆ อาจ import มาจากไฟล์ parse theme อื่นก็ได้
 */
const modeList = ['dark', 'light', 'dim'];

/**
 * createModeSuggestionProvider:
 *  - เป็น CompletionItemProvider
 *  - ทำงานเฉพาะไฟล์ .ctrl.ts (language=typescript)
 *  - จับ pattern `// ctrl mode:` แล้ว Suggest รายชื่อโหมด
 */
export function createModeSuggestionProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // (1) เช็คว่าไฟล์ลงท้ายด้วย .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // (2) อ่านข้อความก่อน Cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // (3) จับ regex ว่า user พิมพ์
        //     // css-ctrl mode:  (แล้วตามด้วยอะไรก็ได้)
        //     เช่น "// css-ctrl mode:"
        //     ตัวอย่าง: /\/\/\s*css-ctrl\s+mode:\s*[\w-]*$/
        const regex = /\/\/\s*css-ctrl\s+mode:\s*[\w-]*$/;
        if (!regex.test(textBeforeCursor)) {
          return;
        }

        // (4) สร้าง CompletionItem[] จาก modeList (dark, light, dim, ...)
        const items: vscode.CompletionItem[] = modeList.map((m) => {
          const ci = new vscode.CompletionItem(m, vscode.CompletionItemKind.EnumMember);
          ci.insertText = m; // user เลือก => แทรกคำว่า m
          ci.detail = `CSS-CTRL mode: ${m}`;
          ci.documentation = new vscode.MarkdownString(`Switch to "${m}" mode.`);
          return ci;
        });

        return items;
      },
    },
    ':' // triggerCharacter => เมื่อ user พิมพ์ ":" จะเรียก provider
  );
}
