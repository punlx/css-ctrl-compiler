// keyframeProvider.ts
import * as vscode from 'vscode';
import { abbrMap } from './constants';

/**
 * createKeyframeProvider:
 * - Suggest keyframe name (my-move, pulse, etc.) เมื่อพิมพ์ "am[" หรือ "am-name["
 * - แสดง detail = keyframeName
 * - แสดง documentation = multi-line css ที่ parse จาก DSL
 */
export function createKeyframeProvider(keyframeDict: Record<string, string>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // ต้องการจับ 2 รูป: "am[" กับ "am-name["
        // => /(am|am-name)\[$/
        const regex = /(am|am-name)\[$/;
        if (!regex.test(textBeforeCursor)) {
          return;
        }

        // สร้าง suggestion
        const completions: vscode.CompletionItem[] = [];

        for (const keyframeName of Object.keys(keyframeDict)) {
          const rawDSL = keyframeDict[keyframeName];
          // parse DSL => multi-line CSS
          const docString = buildKeyframeDoc(rawDSL);

          const item = new vscode.CompletionItem(keyframeName, vscode.CompletionItemKind.Value);
          item.detail = keyframeName;
          item.documentation = docString;

          item.insertText = keyframeName;

          completions.push(item);
        }

        return completions;
      },
    },
    '[' // trigger character
  );
}

/**
 * buildKeyframeDoc:
 *  - รับ string เช่น "0%(bg[red] c[white]) 50%($bg[black]) 100%(bg[red])"
 *  - แตกเป็น segment เช่น "0%(...)", "50%(...)", "100%(...)"
 *  - หรือ "from(bg[red]) to(bg[pink])"
 *  - แปลงเป็น multiline css
 */
function buildKeyframeDoc(raw: string): string {
  // ตัวอย่าง raw: "0%(bg[red] c[white]) 50%($bg[black] w[100px]) 100%(bg[red] w[200px] c[blue])"
  // split ด้วย space? -> ระวัง style อาจ contain space
  // แนวทางง่าย: ใช้ regex จับ (0%|[0-9]+%|from|to)\((.*?)\)
  // แล้ว parse abbr(...) => "property: value;"
  // docString => "0% {\n  background-color:red;\n  ...\n}\n..."

  // match step e.g.  "([0-9]+%|from|to)\((.*?)\)"
  const pattern = /(\d+%|from|to)\((.*?)\)/g;
  let match: RegExpExecArray | null;

  const lines: string[] = [];

  while ((match = pattern.exec(raw)) !== null) {
    const stepName = match[1]; // "0%", "50%", "from", "to"
    const dsl = match[2]; // "bg[red] c[white]" or "$bg[black] w[100px]" ...
    // parse dsl => lines
    const styleLines = parseKeyframeStyleDSL(dsl);

    // build block
    lines.push(`${stepName} {`);
    for (const ln of styleLines) {
      lines.push(`  ${ln}`);
    }
    lines.push(`}`);
    lines.push(''); // เว้นบรรทัด
  }

  // join
  return lines.join('\n');
}

/**
 * parseKeyframeStyleDSL:
 *  - รับ string เช่น "bg[red] c[white] w[200px]" หรือ "$bg[black]"
 *  - split ด้วย space
 *  - แต่ละ chunk => /(\$?)([\w-]+)\[([^\]]+)\]/
 *    - ถ้ามี $ => เอาออก
 *    - ใช้ abbrMap เพื่อ map property
 *    - ex. "bg[red]" => "background-color:red;"
 */
function parseKeyframeStyleDSL(dsl: string): string[] {
  const chunks = dsl.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  for (const chunk of chunks) {
    // match ex. "$bg[black]" or "bg[red]"
    const m = /^(\$?)([\w-]+)\[([^\]]+)\]$/.exec(chunk);
    if (!m) {
      // ถ้าไม่ตรง pattern => ข้าม (ตาม requirement)
      continue;
    }
    // m[1] => '$' or ''
    // m[2] => abbr e.g. "bg"
    // m[3] => value e.g. "black"
    let abbr = m[2];
    const val = m[3];

    // ถ้ามี $ ก็ตัดออกแล้ว proceed
    // (ในที่นี้ $ แค่นำหน้า abbr)
    // abbr = abbr (already no $)
    const cssProp = abbrMap[abbr];
    if (!cssProp) {
      // abbr ไม่มีใน abbrMap => ข้าม
      continue;
    }
    // val e.g. "red" => "red"
    // ex. "background-color:red;"
    result.push(`${cssProp}: ${val};`);
  }

  return result;
}
