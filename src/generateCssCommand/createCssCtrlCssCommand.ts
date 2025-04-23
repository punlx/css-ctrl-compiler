// src/generateCssCommand/createCssCtrlCssCommand.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ensureScopeUnique } from './utils/ensureScopeUnique';
import { parseDirectives } from './parsers/parseDirectives';
import { processClassBlocks } from './helpers/processClassBlocks';
import { handleBindDirectives } from './utils/handleBindDirectives';
import { buildCssText } from './builders/buildCssText';
import { IStyleDefinition } from './types';

import { buildKeyframeNameMap, buildKeyframesCSS } from './parsers/paseKeyFrameBody';

/**
 * globalDefineMap – ถ้าต้องการฟีเจอร์ @const / theme.define ข้ามไฟล์
 * อาจประกาศไว้ตรงนี้ หรือ import มาจากที่อื่น
 */
export const globalDefineMap: Record<string, Record<string, IStyleDefinition>> = {};

/************************************************************
 * ฟังก์ชันหลัก: generateCssCtrlCssFromSource
 ************************************************************/
export function generateCssCtrlCssFromSource(sourceText: string): string {
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
  // ก่อน parse .className blocks เราต้องรู้ว่า kf1 => app_kf1
  // เพื่อเอาไป rename ตอนเจอ abbr "am[kf1 ...]" ใน class blocks
  const keyframeNameMap = buildKeyframeNameMap(keyframeBlocks, scopeName);

  // (D) parse .className blocks => Map<classDisplayKey, styleDef> + shortName->final
  //    (ส่ง keyframeNameMap เข้าไปด้วย)
  const { classMap: classNameDefs, shortNameToFinal } = processClassBlocks(
    scopeName,
    classBlocks,
    constMap,
    keyframeNameMap // <-- ส่งเข้าไป
  );

  // (E) handle @bind
  handleBindDirectives(scopeName, directives, classNameDefs);

  // (F) สร้าง CSS ของ keyframe blocks
  //     (เรารู้ finalName ของแต่ละ kf แล้วจาก keyframeNameMap)
  const keyframeCss = buildKeyframesCSS(keyframeBlocks, keyframeNameMap, scopeName);

  // (G) สร้าง CSS ของ class ต่าง ๆ (ตามลำดับ)
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

  // (2) generate CSS
  let generatedCss: string;
  try {
    generatedCss = generateCssCtrlCssFromSource(finalText.replace(importLine, ''));
  } catch (err) {
    vscode.window.showErrorMessage(`CSS-CTRL parse error: ${(err as Error).message}`);
    throw err;
  }

  // (3) เขียนไฟล์ .ctrl.css
  fs.writeFileSync(newCssFilePath, generatedCss, 'utf8');
}
