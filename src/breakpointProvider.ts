// src/breakpointProvider.ts
import * as vscode from 'vscode';

/**
 * createBreakpointProvider:
 *  - ให้ Suggestion เฉพาะเมื่อผู้ใช้พิมพ์ "screen(" หรือ "container("
 *  - เนื้อหา Suggestion คือชื่อ breakpoint (เช่น "lg","md","sm") จาก screenDict
 *  - detail หรือ documentation จะแปลง 'min-w[1200px]' เป็น '(min-width:1200px)' เพื่อบอกข้อมูล
 *  - เพิ่มเติม: เวลา user เลือก breakpoint => ใส่ ', ' ต่อท้ายให้ผู้ใช้พิมพ์ style ต่อได้เลย
 */

export function createBreakpointProvider(screenDict: Record<string, string>) {
  return vscode.languages.registerCompletionItemProvider(
    // ใช้กับไฟล์ TS/TSX
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

        // 2) ข้อความก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) ตรวจว่า ลงท้ายด้วย "screen(" หรือ "container("
        //    เช่น /(?:screen|container)\($/
        const regex = /(screen|container)\($/;
        if (!regex.test(textBeforeCursor)) {
          return;
        }

        // 4) สร้าง CompletionItem จาก screenDict
        //    เช่น screenDict = { lg:'min-w[1200px]', md:'min-w[900px]', sm:'max-w[700px]' }
        const completions: vscode.CompletionItem[] = [];

        for (const breakpointName of Object.keys(screenDict)) {
          const rawValue = screenDict[breakpointName]; // ex. 'min-w[1200px]'
          const detailText = convertMinMaxString(rawValue); // ex. '(min-width:1200px)'

          const item = new vscode.CompletionItem(breakpointName, vscode.CompletionItemKind.Value);

          // แสดง detail ตรง sidebar ของ Suggest
          item.detail = breakpointName;
          // เพิ่ม doc หรือข้อความอธิบาย
          item.documentation = detailText;

          // ใช้ SnippetString เพื่อใส่ ', ' หลัง breakpoint name
          // เช่น user เลือก "sm" => ได้ "sm, "
          // user สามารถพิมพ์ต่อได้เลย
          item.insertText = new vscode.SnippetString(`${breakpointName}, `);

          completions.push(item);
        }

        return completions;
      },
    },
    '(' // trigger character
  );
}

/**
 * convertMinMaxString:
 * แปลงเช่น 'min-w[1200px]' => '(min-width:1200px)'
 * หรือ 'max-w[700px]' => '(max-width:700px)'
 * ถ้าไม่ตรง pattern เดิมก็คืนค่าเดิม
 */
function convertMinMaxString(val: string): string {
  // จับรูปแบบ min-w[1200px] / max-w[900px]
  const m = /^(min|max)-w\[(\d+px)\]$/.exec(val);
  if (!m) return val;
  // m[1] = 'min' or 'max'
  // m[2] = '1200px'
  return `${m[1]}-width:${m[2]}`;
}
