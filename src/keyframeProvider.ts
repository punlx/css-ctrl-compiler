// src/keyframeProvider.ts

import * as vscode from 'vscode';
import { abbrMap } from './generateCssCommand/constants/abbrMap';

/**
 * createKeyframeProvider:
 * - Suggest keyframe name (my-move, pulse, etc.) เมื่อพิมพ์ "am[" หรือ "am-name["
 * - แสดง detail = keyframeName
 * - แสดง documentation = multi-line css ที่ parse จาก DSL
 * - Requirement เสริม:
 *   1) ถ้าเป็นไฟล์ .ctrl.ts ให้สแกนหา @keyframe <keyframe-name> { ... } ในไฟล์นั้นด้วย
 *   2) เอาชื่อ keyframe ที่สแกนได้ไปรวมกับ keyframeDict
 *   3) ถ้ามีชื่อซ้ำกันให้แสดงแค่ชื่อเดียว
 *   4) แปลง DSL ที่เจอในไฟล์ .ctrl.ts เป็น documentation ได้เหมือนเดิม
 */
export function createKeyframeProvider(keyframeDict: Record<string, string>) {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        if (
          !document.fileName.endsWith('.ctrl.ts') &&
          !document.fileName.endsWith('ctrl.theme.ts')
        ) {
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

        // สแกน keyframe เฉพาะในไฟล์ .ctrl.ts
        let localKeyframeDict: Record<string, string> = {};
        if (document.fileName.endsWith('.ctrl.ts')) {
          const docText = document.getText();
          localKeyframeDict = parseLocalKeyframes(docText);
        }

        // รวมชื่อ keyframe จาก keyframeDict และ localKeyframeDict (กันซ้ำด้วย Set)
        const combinedKeyframeNames = new Set([
          ...Object.keys(keyframeDict),
          ...Object.keys(localKeyframeDict),
        ]);

        // สร้าง suggestion
        const completions: vscode.CompletionItem[] = [];

        for (const keyframeName of combinedKeyframeNames) {
          // ถ้ามีใน localKeyframeDict ให้ใช้ DSL ของ local ก่อน (หรือจะเปลี่ยน logic ได้ตามต้องการ)
          const rawDSL = localKeyframeDict[keyframeName] || keyframeDict[keyframeName];

          if (!rawDSL) {
            continue;
          }

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
 * parseLocalKeyframes:
 * - ค้นหา @keyframe <keyframe-name> { ... } ในไฟล์ .ctrl.ts
 * - ดึง keyframeName + raw DSL (สิ่งที่อยู่ภายใน {})
 * - เก็บเข้า localDict เพื่อเอาไป merge กับ keyframeDict
 */
function parseLocalKeyframes(documentText: string): Record<string, string> {
  const localDict: Record<string, string> = {};
  // ใช้ [\s\S]*? + 'g' + '?' (lazy) เพื่อ match หลายบรรทัด
  const pattern = /@keyframe\s+([\w-]+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(documentText)) !== null) {
    const keyframeName = match[1];
    const rawDSL = match[2].trim();
    localDict[keyframeName] = rawDSL;
  }

  return localDict;
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

  const pattern = /(\d+%|from|to)\((.*?)\)/g;
  let match: RegExpExecArray | null;
  const lines: string[] = [];

  while ((match = pattern.exec(raw)) !== null) {
    const stepName = match[1];
    const dsl = match[2];
    const styleLines = parseKeyframeStyleDSL(dsl);
    lines.push(`${stepName} {`);
    for (const ln of styleLines) {
      lines.push(`  ${ln}`);
    }
    lines.push(`}`);
    lines.push('');
  }
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
    const m = /^(\$?)([\w-]+)\[([^\]]+)\]$/.exec(chunk);
    if (!m) {
      continue;
    }
    // m[1] => '$' or ''
    // m[2] => abbr e.g. "bg"
    // m[3] => value e.g. "black"
    const abbr = m[2];
    const val = m[3];
    const cssProp = abbrMap[abbr];
    if (!cssProp) {
      continue;
    }
    result.push(`${cssProp}: ${val};`);
  }

  return result;
}
