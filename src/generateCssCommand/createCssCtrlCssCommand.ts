// src/generateCssCommand/createCssCtrlCssCommand.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ensureScopeUnique } from './utils/ensureScopeUnique';
import { parseDirectives } from './parsers/parseDirectives';
import { processClassBlocks } from './helpers/processClassBlocks';
import { buildCssText } from './builders/buildCssText';
import { IStyleDefinition } from './types';

import { buildKeyframeNameMap, buildKeyframesCSS } from './parsers/paseKeyFrameBody';
import { parseThemeClassFull } from '../parseTheme';
import { formatCss } from '../formatters/formatCss';

/**
 * globalDefineMap – ถ้าต้องการฟีเจอร์ @const / theme.property ข้ามไฟล์
 * อาจประกาศไว้ตรงนี้ หรือ import มาจากที่อื่น
 */
export const globalDefineMap: Record<string, Record<string, IStyleDefinition>> = {};

/************************************************************
 * ฟังก์ชันหลัก: generateCssCtrlCssFromSource
 * (CHANGED) เปลี่ยนเป็น async เพื่อเรียกใช้ getThemeClassSet() แบบ async
 ************************************************************/
export async function generateCssCtrlCssFromSource(sourceText: string): Promise<string> {
  // (A) parse directives
  const {
    directives,
    classBlocks,
    constBlocks,
    // --- ADDED FOR KEYFRAME ---
    keyframeBlocks,
  } = parseDirectives(sourceText);

  // (B) หาค่า scope จาก @scope
  const scopeDir = directives.find((d) => d.name === 'scope');
  const scopeName = scopeDir?.value || 'none';

  ensureScopeUnique(scopeName);

  // (C) สร้าง constMap จาก @const
  const constMap = new Map<string, IStyleDefinition>();
  for (const c of constBlocks) {
    constMap.set(c.name, c.styleDef);
  }

  // --- NEW STEP for Keyframe NameMap ---
  const keyframeNameMap = buildKeyframeNameMap(keyframeBlocks, scopeName);

  // (D) parse .className blocks => Map<classDisplayKey, styleDef> + shortNameToFinal
  const { classMap: classNameDefs, shortNameToFinal } = processClassBlocks(
    scopeName,
    classBlocks,
    constMap,
    keyframeNameMap
  );

  // (E) เดิมเราจะ call handleBindDirectives(...) ที่ top-level
  //     (REMOVED) เราไม่ทำแล้ว เพราะ @bind ย้ายไปอยู่ใน .class

  // (CHANGED) เรียกแบบ async เพื่อได้ชุด class จาก theme เหมือน provider Suggest
  const themeClassSet = await getThemeClassSet();

  // (CHANGED) เรียกฟังก์ชันตรวจสอบ @bind ภายในแต่ละ class
  checkBindLines(scopeName, classNameDefs, themeClassSet);

  // (F) สร้าง CSS ของ keyframe blocks
  const keyframeCss = buildKeyframesCSS(keyframeBlocks, keyframeNameMap, scopeName);

  // (G) สร้าง CSS ของ class ต่าง ๆ
  let finalCss = keyframeCss; // วาง keyframe ก่อน
  for (const [displayKey, styleDef] of classNameDefs.entries()) {
    finalCss += buildCssText(displayKey, styleDef, shortNameToFinal, scopeName);
  }

  return finalCss;
}

/************************************************************
 * createCssCtrlCssFile(doc): สร้างไฟล์ .ctrl.css + import
 ************************************************************/
export async function createCssCtrlCssFile(doc: vscode.TextDocument) {
  // เช็คไฟล์ .ctrl.ts
  if (!doc.fileName.endsWith('.ctrl.ts')) {
    return;
  }

  const fileName = path.basename(doc.fileName); // e.g. "example.ctrl.ts"
  const base = fileName.replace(/\.ctrl\.ts$/, ''); // e.g. "example"

  const currentDir = path.dirname(doc.fileName);
  const newCssFilePath = path.join(currentDir, base + '.ctrl.css');
  if (!fs.existsSync(newCssFilePath)) {
    fs.writeFileSync(newCssFilePath, '', 'utf8');
  }

  // สร้าง import line => import './example.ctrl.css';
  const relImport = `./${base}.ctrl.css`;
  const importLine = `import '${relImport}';\n`;

  // ดึงโค้ดทั้งหมด (string)
  const fullText = doc.getText();
  const sanitizedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ลบ import line เก่า (ถ้ามี)
  const oldRegex = new RegExp(
    `^import\\s+["'][^"']*${sanitizedBase}\\.ctrl\\.css["'];?\\s*(?:\\r?\\n)?`,
    'm'
  );
  let newText = fullText.replace(oldRegex, '').trim();
  newText = newText.replace(/\n{2,}/g, '\n');

  // ใส่ import line ใหม่
  const finalText = importLine + newText;

  // แก้ไขไฟล์ .ctrl.ts ใน VSCode
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    doc.lineAt(doc.lineCount - 1).range.end
  );
  edit.replace(doc.uri, fullRange, finalText);
  await vscode.workspace.applyEdit(edit);

  // (2) generate CSS (CHANGED ให้เป็น await)
  let generatedCss: string;
  try {
    generatedCss = await generateCssCtrlCssFromSource(finalText.replace(importLine, ''));
  } catch (err) {
    vscode.window.showErrorMessage(`CSS-CTRL parse error: ${(err as Error).message}`);
    throw err;
  }

  const formattedCss = await formatCss(generatedCss);

  // (3) เขียนไฟล์ .ctrl.css
  fs.writeFileSync(newCssFilePath, formattedCss, 'utf8');
}

/**
 * (CHANGED) เปลี่ยนเป็น async เพื่อใช้ workspace.findFiles
 */
async function getThemeClassSet(): Promise<Set<string>> {
  const files = await vscode.workspace.findFiles('**/ctrl.theme.ts', '**/node_modules/**', 1);
  if (!files || files.length === 0) {
    return new Set();
  }
  const themeFilePath = files[0].fsPath;
  if (!fs.existsSync(themeFilePath)) {
    return new Set();
  }
  const classMap = parseThemeClassFull(themeFilePath);
  return new Set(Object.keys(classMap));
}

/**
 * (CHANGED) checkBindLines: เดิมเคย throw error ถ้า class ไม่อยู่ใน .ctrl.ts หรือ theme.class(...)
 * ตอนนี้แก้ไขให้ **ไม่สนใจ** แล้ว อยาก bind อะไรก็ได้ ไม่เช็คว่าอยู่ที่ไหน
 */
function checkBindLines(
  scopeName: string,
  classMap: Map<string, IStyleDefinition>,
  themeClassSet: Set<string>
) {
  for (const [displayKey, styleDef] of classMap.entries()) {
    if (!(styleDef as any)._bindLines) {
      continue;
    }
    const bindLines = (styleDef as any)._bindLines as string[];

    for (const bindLine of bindLines) {
      const raw = bindLine.replace('@bind', '').trim();
      if (!raw) {
        continue;
      }
      const refs = raw.split(/\s+/);
      for (const ref of refs) {
        // ยังเช็คว่าเริ่มด้วย '.' (e.g. ".box1")
        if (!ref.startsWith('.')) {
          throw new Error(
            `[CSS-CTRL-ERR] @bind usage must reference classes with a dot. got "${ref}"`
          );
        }
        // ---- (เปลี่ยน) ยกเลิกการเช็คว่าอยู่ใน .ctrl.ts หรือ theme.class
        // ---- ดังนั้น ไม่ throw error แม้จะไม่พบ
      }
    }
  }
}
