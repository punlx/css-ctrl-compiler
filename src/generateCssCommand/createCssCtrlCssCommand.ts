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
import { convertCSSVariable } from './helpers/convertCSSVariable'; // ใช้แปลงค่าที่มี "--xxx" ให้เป็น "var(--xxx)" ถ้าจำเป็น

/**
 * globalDefineMap – ถ้าต้องการฟีเจอร์ @const / theme.property ข้ามไฟล์
 * อาจประกาศไว้ตรงนี้ หรือ import มาจากที่อื่น
 */
export const globalDefineMap: Record<string, Record<string, IStyleDefinition>> = {};

/************************************************************
 * ฟังก์ชันหลัก: generateCssCtrlCssFromSource
 *  - รองรับ @var top-level (เช่น @var color[red]) และแทน SCOPEVAR(...) => var(--color-scopeName)
 *  - รองรับ @bind เช่นกัน (ผ่าน checkBindLines)
 *  - เรียกแบบ async เพื่อใช้ getThemeClassSet()
 ************************************************************/
export async function generateCssCtrlCssFromSource(sourceText: string): Promise<string> {
  // (A) parse directives
  const {
    directives,
    classBlocks,
    constBlocks,
    keyframeBlocks,
    varDefs, // (NEW) เก็บ @var top-level
  } = parseDirectives(sourceText);

  // (B) หาค่า scope จาก @scope
  const scopeDir = directives.find((d) => d.name === 'scope');
  const scopeName = scopeDir?.value || 'none';

  ensureScopeUnique(scopeName);

  // (NEW) เช็คถ้า scope=none แต่มี varDefs => throw error
  if (scopeName === 'none' && varDefs.length > 0) {
    throw new Error(
      `[CSS-CTRL-ERR] Cannot use @var when scope=none. Found ${varDefs.length} top-level var(s).`
    );
  }

  // (C) สร้าง constMap จาก @const
  const constMap = new Map<string, IStyleDefinition>();
  for (const c of constBlocks) {
    constMap.set(c.name, c.styleDef);
  }

  // (D) สร้าง keyframeNameMap (สำหรับ rename keyframe => scope_keyframeName)
  const keyframeNameMap = buildKeyframeNameMap(keyframeBlocks, scopeName);

  // (E) parse .className blocks => ได้ classNameDefs + shortNameToFinal
  const { classMap: classNameDefs, shortNameToFinal } = processClassBlocks(
    scopeName,
    classBlocks,
    constMap,
    keyframeNameMap
  );

  // (F) โหลดชุด class จาก theme (ถ้ามี) เพื่อเช็ค @bind
  const themeClassSet = await getThemeClassSet();
  // (G) เรียกฟังก์ชันตรวจสอบ @bind
  checkBindLines(scopeName, classNameDefs, themeClassSet);

  // (H) สร้าง keyframe CSS (+ ยังไม่ต่อกับ class)
  //     (UPDATED) ไม่มี varDefs ใน buildKeyframesCSS เดิม => ถ้าต้องใช้ varDefs ให้แก้ใน paseKeyFrameBody.ts ด้วย
  //     ในกรณีนี้ assume buildKeyframesCSS ปัจจุบันอาจรองรับ varDefs แล้ว
  const keyframeCss = buildKeyframesCSS(keyframeBlocks, keyframeNameMap, scopeName, varDefs);

  // (I) สร้าง block ของ @var top-level => :root{ ... }
  const scopeVarsMap: Record<string, string> = {};
  for (const vdef of varDefs) {
    const finalName = `--${vdef.varName}-${scopeName}`;
    scopeVarsMap[finalName] = convertCSSVariable(vdef.rawValue);
  }
  let rootBlock = '';
  for (const finalName in scopeVarsMap) {
    rootBlock += `${finalName}:${scopeVarsMap[finalName]};`;
  }
  const varDefCss = rootBlock ? `:root{${rootBlock}}` : '';

  // (J) แปลง SCOPEVAR(...) => var(--xxx-scopeName) ใน class styleDef (recursive)
  for (const [displayKey, styleDef] of classNameDefs.entries()) {
    transformScopeVarsRecursive(styleDef, scopeName, varDefs);
  }

  // (K) ประกอบ CSS
  // - เอา :root{...} ของ varDefs ก่อน
  // - ต่อด้วย keyframeCss
  // - แล้วตามด้วย class-based css
  let finalCss = varDefCss + keyframeCss;
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

  // (2) generate CSS (async)
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

/************************************************************
 * ฟังก์ชันช่วยอื่น ๆ
 ************************************************************/

/**
 * (CHANGED) เปลี่ยนเป็น async เพื่อใช้ workspace.findFiles
 *  - แค่ load ไฟล์ ctrl.theme.ts ถ้ามี เพื่อนำ className ไปตรวจ @bind
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
 *  ตอนนี้แก้เป็น “ใครจะ bind อะไร bind ไป” แต่ยังเช็คว่า .className ขึ้นต้นด้วยจุด 
 *  ถ้าไม่ใส่จุด => throw
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
        if (!ref.startsWith('.')) {
          throw new Error(
            `[CSS-CTRL-ERR] @bind usage must reference classes with a dot. got "${ref}"`
          );
        }
        // ยกเลิกการเช็คว่ามีอยู่จริงใน themeClassSet หรือไม่
      }
    }
  }
}

/**
 * transformScopeVarsRecursive:
 *   แทนที่ SCOPEVAR(xxx) => var(--xxx-scopeName) ใน styleDef ปกติ (ไม่ใช่ keyframe)
 *   แล้ว recurse ลง nestedQueries
 */
function transformScopeVarsRecursive(
  styleDef: IStyleDefinition,
  scopeName: string,
  varDefs: Array<{ varName: string; rawValue: string }>
) {
  const declaredVars = new Set(varDefs.map((v) => v.varName));
  const re = /SCOPEVAR\(([\w-]+)\)/g;

  function doReplace(str: string): string {
    return str.replace(re, (_, name) => {
      if (!declaredVars.has(name)) {
        throw new Error(`[CSS-CTRL-ERR] Using @${name} but not declared with @var ${name}[...].`);
      }
      return `var(--${name}-${scopeName})`;
    });
  }

  // base
  for (const prop in styleDef.base) {
    styleDef.base[prop] = doReplace(styleDef.base[prop]);
  }

  // states
  for (const stName in styleDef.states) {
    const stObj = styleDef.states[stName];
    for (const p in stObj) {
      stObj[p] = doReplace(stObj[p]);
    }
  }

  // pseudos
  if (styleDef.pseudos) {
    for (const pseudoKey in styleDef.pseudos) {
      const pObj = styleDef.pseudos[pseudoKey];
      if (!pObj) continue;
      for (const prop in pObj) {
        pObj[prop] = doReplace(pObj[prop]);
      }
    }
  }

  // screens
  for (const sc of styleDef.screens) {
    for (const prop in sc.props) {
      sc.props[prop] = doReplace(sc.props[prop]);
    }
  }

  // containers
  for (const ctnr of styleDef.containers) {
    for (const prop in ctnr.props) {
      ctnr.props[prop] = doReplace(ctnr.props[prop]);
    }
  }

  // pluginStates
  if ((styleDef as any).pluginStates) {
    const pluginStates = (styleDef as any).pluginStates;
    for (const stKey in pluginStates) {
      const stObj = pluginStates[stKey];
      if (!stObj || !stObj.props) continue;
      for (const propKey in stObj.props) {
        stObj.props[propKey] = doReplace(stObj.props[propKey]);
      }
    }
  }

  // pluginContainers
  if ((styleDef as any).pluginContainers) {
    const pcArr = (styleDef as any).pluginContainers;
    for (const pcObj of pcArr) {
      for (const prop in pcObj.props) {
        pcObj.props[prop] = doReplace(pcObj.props[prop]);
      }
    }
  }

  // nestedQueries => recurse
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      transformScopeVarsRecursive(nq.styleDef, scopeName, varDefs);
      if (nq.children && nq.children.length > 0) {
        for (const c of nq.children) {
          transformScopeVarsRecursive(c.styleDef, scopeName, varDefs);
        }
      }
    }
  }
}
