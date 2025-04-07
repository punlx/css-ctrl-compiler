// src/generateCssCommand/createCssCtrlCssCommand.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ensureScopeUnique } from './utils/ensureScopeUnique';
import { parseDirectives } from './parsers/parseDirectives';
import { processClassBlocks } from './helpers/processClassBlocks';
import { handleBindDirectives } from './utils/handleBindDirectives';
import { transFormVariables } from './transformers/transformVariables';
import { transformLocalVariables } from './transformers/transformLocalVariables';
import { buildCssText } from './builders/buildCssText';
import { IStyleDefinition } from './types';

/**
 * globalDefineMap – ถ้าต้องการฟีเจอร์ @const / theme.define ข้ามไฟล์
 * อาจประกาศไว้ตรงนี้ หรือ import มาจากที่อื่น
 */
export const globalDefineMap: Record<string, Record<string, IStyleDefinition>> = {};

/************************************************************
 * ฟังก์ชันหลัก: generateCssCtrlCssFromSource
 * - parse directive (@scope, @bind, @const)
 * - processClassBlocks
 * - handle bind
 * - transform variables (main + query block)
 * - build CSS text
 * - return เป็น string CSS
 ************************************************************/
export function generateCssCtrlCssFromSource(sourceText: string): string {
  // (A) parse directives
  const { directives, classBlocks, constBlocks } = parseDirectives(sourceText);

  // (B) หาค่า scope จาก @scope
  const scopeDir = directives.find((d) => d.name === 'scope');
  const scopeName = scopeDir?.value || 'none';

  // กันซ้ำ scope (ถ้าต้องการ)
  ensureScopeUnique(scopeName);

  // (C) สร้าง constMap จาก @const
  const constMap = new Map<string, IStyleDefinition>();
  for (const c of constBlocks) {
    constMap.set(c.name, c.styleDef);
  }

  // (D) parse .className blocks => Map<classDisplayKey, styleDef>
  const classNameDefs = processClassBlocks(scopeName, classBlocks, constMap);

  // (E) handle @bind
  handleBindDirectives(scopeName, directives, classNameDefs);

  // (F) วนสร้าง CSS
  let finalCss = '';
  for (const [displayKey, styleDef] of classNameDefs.entries()) {
    // สมมติถ้า scopeName !== 'none'
    //    displayKey อาจเป็น "app_box" หรือ "box_ab1XZ"
    // ถ้า scopeName==='none' => displayKey="box" (เหมือน className เดิม)

    // ตัด scopeName_ ออกจาก displayKey เพื่อให้เหลือ className จริง
    // (สำหรับส่งเข้า transFormVariables(...) / transformLocalVariables(...))
    let className = displayKey;
    if (scopeName !== 'none' && displayKey.startsWith(scopeName + '_')) {
      className = displayKey.slice(scopeName.length + 1);
    }

    // (F1) transform variable (parent)
    transFormVariables(styleDef, scopeName, className);
    transformLocalVariables(styleDef, scopeName, className);

    // (F2) ถ้ามี query block => transform ด้วย
    if (styleDef.queries && styleDef.queries.length > 0) {
      for (const qb of styleDef.queries) {
        // copy localVars จาก parent ถ้าจำเป็น
        if (!qb.styleDef.localVars) {
          qb.styleDef.localVars = {};
        }
        if (styleDef.localVars) {
          Object.assign(qb.styleDef.localVars, styleDef.localVars);
        }

        // transform query block
        transFormVariables(qb.styleDef, scopeName, className);
        transformLocalVariables(qb.styleDef, scopeName, className);
      }
    }

    // (F3) build CSS text
    finalCss += buildCssText(displayKey, styleDef);
  }

  return finalCss;
}

/************************************************************
 * ฟังก์ชัน createCssCtrlCssFile(doc): แค่ตัวอย่างการใช้งาน
 * - แก้ import line
 * - generate CSS
 * - เขียนไฟล์ .ctrl.css
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
    // เรียกฟังก์ชัน generateCssCtrlCssFromSource (ด้านบน)
    generatedCss = generateCssCtrlCssFromSource(finalText.replace(importLine, ''));
  } catch (err) {
    vscode.window.showErrorMessage(`CSS-CTRL parse error: ${(err as Error).message}`);
    throw err;
  }

  // (3) เขียนไฟล์ .ctrl.css
  fs.writeFileSync(newCssFilePath, generatedCss, 'utf8');
}
