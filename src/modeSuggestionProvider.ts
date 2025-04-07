// modeSuggestionProvider.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

async function parseModesFromCtrlTheme(): Promise<string[]> {
  let modes: string[] = [];
  try {
    // (1) หาไฟล์ ctrl.theme.ts
    const uris = await vscode.workspace.findFiles('**/ctrl.theme.ts', '**/node_modules/**', 1);
    if (uris.length === 0) {
      return modes;
    }

    const themeFilePath = uris[0].fsPath;
    const content = fs.readFileSync(themeFilePath, 'utf8');

    // (2) สร้าง regex จับแถวแรก
    //    /theme\.palette\s*\(\s*\[\s*\[\s*([\s\S]*?)\]\s*[,|\]]/ms
    //    flag m + s => dotAll + multiline
    const paletteRegex = /theme\.palette\s*\(\s*\[\s*\[\s*([\s\S]*?)\]\s*[,\]]/ms;
    const match = paletteRegex.exec(content);
    if (!match) {
      return modes;
    }

    const row0raw = match[1].trim();
    // ตัวอย่าง row0raw = "'dark','light','dim','base'"

    // (3) แปลง ' => " เพื่อ parse JSON
    // ใส่ "[" + ... + "]" ครอบ
    // row0raw = "'dark','light','dim','base'"
    const row0json = `[${row0raw.replace(/'/g, '"')}]`;
    // => "[\"dark\",\"light\",\"dim\",\"base\"]"
    try {
      const arr = JSON.parse(row0json);
      if (Array.isArray(arr)) {
        modes = arr.map((m) => m.trim());
      }
    } catch (e) {
      // parse error => modes=[]
    }
  } catch (err) {
    // readFile error => modes=[]
  }
  return modes;
}

export function createModeSuggestionProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      async provideCompletionItems(document, position) {
        // (A) เช็ค fileName => .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // (B) เช็ค pattern
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const regex = /\/\/\s*css-ctrl\s+mode:\s*[\w-]*$/;
        if (!regex.test(textBeforeCursor)) {
          return;
        }

        // (C) parse modeList from ctrl.theme.ts
        const modeList = await parseModesFromCtrlTheme();
        if (modeList.length === 0) {
          // fallback ถ้าต้องการ
          // modeList = ['dark','light','dim'];
        }

        // (D) สร้าง completion item
        const items: vscode.CompletionItem[] = modeList.map((m) => {
          const ci = new vscode.CompletionItem(m, vscode.CompletionItemKind.EnumMember);
          ci.insertText = m;
          ci.detail = `css-ctrl mode: ${m}`;
          ci.documentation = new vscode.MarkdownString(`Switch to "${m}" mode from ctrl.theme`);
          return ci;
        });

        return items;
      },
    },
    ':' // trigger
  );
}
