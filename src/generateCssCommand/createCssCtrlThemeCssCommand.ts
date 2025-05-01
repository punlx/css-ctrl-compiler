// src/generateCssCommand/createCssCtrlThemeCssCommand.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { abbrMap } from './constants/abbrMap'; // <-- import มาให้แล้ว เอาไปใช้เลย เอาไว้ map shorthand => property

// (NEW) import เพื่อใช้ parseSingleAbbr, createEmptyStyleDef, buildCssText
import { parseSingleAbbr } from './parsers/parseSingleAbbr';
import { createEmptyStyleDef } from './helpers/createEmptyStyleDef';
import { buildCssText } from './builders/buildCssText';
import { formatCss } from '../formatters/formatCss';

// ---------------------- simulate from theme.ts ----------------------
function generatePaletteCSS(colors: string[][]): string {
  const modes = colors[0];
  const colorRows = colors.slice(1);

  let cssResult = '';
  for (let i = 0; i < modes.length; i++) {
    const modeName = modes[i];
    let classBody = '';
    for (let j = 0; j < colorRows.length; j++) {
      const row = colorRows[j];
      const colorName = row[0];
      const colorValue = row[i + 1];
      classBody += `--${colorName}:${colorValue};`;
    }
    cssResult += `html.${modeName}{${classBody}}`;
  }
  return cssResult;
}

function parseKeyframeAbbr(
  abbrBody: string,
  keyframeName: string,
  blockLabel: string
): {
  cssText: string;
  varMap: Record<string, string>;
  defaultVars: Record<string, string>;
} {
  const regex = /([\w\-\$]+)\[(.*?)\]/g;
  let match: RegExpExecArray | null;

  let cssText = '';
  const varMap: Record<string, string> = {};
  const defaultVars: Record<string, string> = {};

  while ((match = regex.exec(abbrBody)) !== null) {
    let styleAbbr = match[1];
    let propVal = match[2];

    // ถ้ามี --xxx อยู่ในค่า propVal ก็ transform เป็น var(--xxx)
    if (propVal.includes('--')) {
      propVal = propVal.replace(/(--[\w-]+)/g, 'var($1)');
    }

    let isVar = false;
    if (styleAbbr.startsWith('$')) {
      isVar = true;
      styleAbbr = styleAbbr.slice(1);
      if (styleAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography in keyframe.`
        );
      }
    }

    // lookup abbrMap => ถ้าไม่เจอ => ถือว่าเป็น property ตรง ๆ
    const finalProp = abbrMap[styleAbbr as keyof typeof abbrMap] || styleAbbr;

    if (isVar) {
      const finalVarName = `--${styleAbbr}-${keyframeName}-${blockLabel.replace('%', '')}`;
      cssText += `${finalProp}:var(${finalVarName});`;
      varMap[styleAbbr] = finalVarName;
      defaultVars[finalVarName] = propVal;
    } else {
      cssText += `${finalProp}:${propVal};`;
    }
  }

  return { cssText, varMap, defaultVars };
}

/**
 * (MODIFIED) parseKeyframeString
 *  - เดิมใช้ regex /(\b(?:\d+%|from|to))\(([^)]*)\)/g เพื่อจับ from(...) / 50%(...) / to(...)
 *  - เปลี่ยนมาใช้ฟังก์ชัน mergeKeyframeBlocksForTheme(...) เพื่อรองรับ multiline DSL
 */
function parseKeyframeString(keyframeName: string, rawStr: string): string {
  // ตรวจจับการใช้ $ หรือ --& ภายใน theme.keyframe
  if (rawStr.includes('$')) {
    throw new Error(
      `[CSS-CTRL-ERR] $variable is not allowed in theme.keyframe("${keyframeName}").`
    );
  }
  if (rawStr.includes('--&')) {
    throw new Error(
      `[CSS-CTRL-ERR] local var (--&xxx) is not allowed in theme.keyframe("${keyframeName}").`
    );
  }

  // รวมเป็น blocks โดยดู from(...) / to(...) / 50%(...) แบบ multiline
  const blocksParsed = mergeKeyframeBlocksForTheme(rawStr);

  const blocks: Array<{ label: string; css: string }> = [];
  const defaultVarMap: Record<string, string> = {};

  for (const b of blocksParsed) {
    // b.label => "from" / "to" / "50%"
    // b.body => DSL ภายในวงเล็บ
    const { cssText, varMap, defaultVars } = parseKeyframeAbbr(
      b.body.trim(),
      keyframeName,
      b.label
    );

    blocks.push({ label: b.label, css: cssText });
    Object.assign(defaultVarMap, defaultVars);
  }

  // รวม rootVar ถ้ามี
  let rootVarsBlock = '';
  for (const varName in defaultVarMap) {
    rootVarsBlock += `${varName}:${defaultVarMap[varName]};`;
  }

  let finalCss = '';
  if (rootVarsBlock) {
    finalCss += `:root{${rootVarsBlock}}`;
  }

  let body = '';
  for (const b of blocks) {
    body += `${b.label}{${b.css}}`;
  }
  finalCss += `@keyframes ${keyframeName}{${body}}`;

  return finalCss;
}

/**
 * (NEW) mergeKeyframeBlocksForTheme:
 *  - รองรับการเขียน from(...) / to(...) / 50%(...) หลายบรรทัด
 *  - ค้นเจอ label => from/to/xx% => แล้วรวบรวม text ภายใน ( ... ) ด้วยการนับวงเล็บ
 */
function mergeKeyframeBlocksForTheme(
  rawStr: string
): Array<{ label: string; body: string }> {
  const result: Array<{ label: string; body: string }> = [];

  // แปลงเป็น list ของ token (line) คร่าว ๆ เพื่อรวมกัน
  const lines = rawStr.split('\n');
  let combined = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');

  // เราจะสแกนหา pattern: (from|to|\d+%)(
  // แล้วอ่านต่อไปจนกว่าจะปิดวงเล็บครบ
  let i = 0;
  while (i < combined.length) {
    // หา label
    const labelMatch = /^(?:from|to|\d+%)/i.exec(combined.slice(i));
    if (!labelMatch) {
      // ถ้าไม่ match => ข้าม 1 char
      i++;
      continue;
    }

    // ตำแหน่ง label เริ่ม
    const labelStart = i + labelMatch.index!;
    const labelStr = labelMatch[0].toLowerCase();
    i = labelStart + labelStr.length;

    // ข้าม whitespace
    while (i < combined.length && /\s/.test(combined[i])) {
      i++;
    }

    // ต้องเจอ '('
    if (combined[i] !== '(') {
      throw new Error(
        `[CSS-CTRL-ERR] Keyframe DSL parse error: missing '(' after "${labelStr}".`
      );
    }
    // เริ่มเก็บ body
    let nested = 1;
    let j = i + 1;
    for (; j < combined.length; j++) {
      if (combined[j] === '(') nested++;
      else if (combined[j] === ')') nested--;
      if (nested === 0) {
        break;
      }
    }
    if (nested !== 0) {
      throw new Error(
        `[CSS-CTRL-ERR] Keyframe DSL parse error: missing closing ')' for "${labelStr}".`
      );
    }

    const bodyContent = combined.slice(i + 1, j); // ระหว่าง ( ...)
    i = j + 1;

    // เก็บผล
    result.push({ label: labelStr, body: bodyContent });
  }

  return result;
}

function generateVariableCSS(variableMap: Record<string, string>): string {
  let rootBlock = '';
  for (const key in variableMap) {
    rootBlock += `--${key}:${variableMap[key]};`;
  }
  return rootBlock ? `:root{${rootBlock}}` : '';
}

interface IParseResult {
  palette: string[][] | null;
  variable: Record<string, string>;
  keyframe: Record<string, string>;
  // (NEW) เพิ่ม classMap สำหรับ theme.class
  classMap?: Record<string, string>;
}

/**
 * parseCssCtrlThemeSource
 *  - ดึงข้อมูลจาก theme.palette([...]), theme.variable({...}), theme.keyframe({...}), และ theme.class({...})
 */
function parseCssCtrlThemeSource(sourceText: string): IParseResult {
  const result: IParseResult = {
    palette: null,
    variable: {},
    keyframe: {},
    classMap: {},
  };

  // ---------------- parse palette(...) ----------------
  const paletteRegex = /theme\.palette\s*\(\s*\[([\s\S]*?)\]\s*\)/;
  const paletteMatch = paletteRegex.exec(sourceText);
  if (paletteMatch) {
    const bracketContent = paletteMatch[1].trim();
    const bracketJson = bracketContent.replace(/'/g, '"');
    let finalJsonStr = `[${bracketJson}]`;
    finalJsonStr = finalJsonStr.replace(/,\s*\]/g, ']');

    try {
      const arr = JSON.parse(finalJsonStr);
      if (Array.isArray(arr)) {
        result.palette = arr;
      }
    } catch (err) {
      console.error('Parse palette error:', err);
    }
  }

  // ---------------- parse variable({...}) ----------------
  const varRegex = /theme\.variable\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/;
  const varMatch = varRegex.exec(sourceText);
  if (varMatch) {
    const varBody = varMatch[1].trim().replace(/\n/g, ' ');
    const kvRegex = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = kvRegex.exec(varBody)) !== null) {
      const k = m[1];
      const v = m[2];
      result.variable[k] = v;
    }
  }

  // ---------------- parse keyframe({...}) ----------------
  const keyframeRegex = /theme\.keyframe\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/;
  const keyframeMatch = keyframeRegex.exec(sourceText);
  if (keyframeMatch) {
    const kfBody = keyframeMatch[1];
    const itemRegex = /(['"]?)([\w-]+)\1\s*:\s*(`([\s\S]*?)`|['"]([\s\S]*?)['"])/g;
    let km: RegExpExecArray | null;
    while ((km = itemRegex.exec(kfBody)) !== null) {
      const kName = km[2];
      const contentBacktick = km[4];
      const contentQuote = km[5];
      const rawContent = contentBacktick || contentQuote || '';
      const finalContent = rawContent.trim();
      result.keyframe[kName] = finalContent;
    }
  }

  // ---------------- parse class({...}) ----------------
  const classRegex = /theme\.class\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/m;
  const classMatch = classRegex.exec(sourceText);
  if (classMatch) {
    const rawBody = classMatch[1];
    const itemRegex = /(['"]?)([A-Za-z_-][\w-]*)\1\s*:\s*(?:`([^`]*)`|['"]([^'"]*)['"])/g;
    let im: RegExpExecArray | null;
    while ((im = itemRegex.exec(rawBody)) !== null) {
      const className = im[2];
      const dsl = im[3] || im[4] || '';
      // เช็ค disallowed ($, --&, @use, @query) ที่นี่ก็ได้
      if (/\$/.test(dsl) || /--&/.test(dsl) || /@use/.test(dsl) || /(@query|>)/.test(dsl)) {
        throw new Error(
          `[CSS-CTRL-ERR] theme.class(...) not allowed to use $var, --&var, @use, or @query. Found in class "${className}".`
        );
      }
      result.classMap![className] = dsl.trim();
    }
  }

  return result;
}

/**
 * generateCssCtrlThemeCssFromSource
 *  - เรียก parseCssCtrlThemeSource
 *  - สร้าง CSS ของ palette, variable, keyframe
 *  - (NEW) สร้าง CSS ของ class(...) ด้วย parse DSL
 */
function generateCssCtrlThemeCssFromSource(sourceText: string): string {
  const parsed = parseCssCtrlThemeSource(sourceText);

  let css = '';
  if (parsed.palette) {
    css += generatePaletteCSS(parsed.palette);
  }
  if (Object.keys(parsed.variable).length > 0) {
    css += generateVariableCSS(parsed.variable);
  }
  for (const kName in parsed.keyframe) {
    css += parseKeyframeString(kName, parsed.keyframe[kName]);
  }

  // (NEW) ถ้ามี classMap => generate class CSS
  if (parsed.classMap && Object.keys(parsed.classMap).length > 0) {
    css += generateThemeClassCSS(parsed.classMap);
  }

  return css;
}

/**
 * (NEW) generateThemeClassCSS
 *  - parse DSL -> build IStyleDefinition -> buildCssText(scope=none)
 */
function generateThemeClassCSS(classMap: Record<string, string>): string {
  let outCss = '';
  for (const className in classMap) {
    const dslStr = classMap[className];
    // สร้าง IStyleDefinition
    const styleDef = createEmptyStyleDef();

    // แยก token ตามที่ parseSingleAbbr เคยใช้
    const tokens = dslStr.split(/ (?=[^\[\]]*(?:\[|$))/);
    for (const tk of tokens) {
      parseSingleAbbr(tk, styleDef, false, false, false);
    }

    // build เป็น CSS
    // scope=none => ให้เป็น .className ตรง ๆ, shortNameToFinal ใช้ new Map()
    const classCss = buildCssText(className, styleDef, new Map(), 'none');
    outCss += classCss;
  }
  return outCss;
}

/**
 * createCssCtrlThemeCssFile
 *  - ใช้ generateCssCtrlThemeCssFromSource สร้างไฟล์ .css
 *  - ใส่ import './xxxx.css'
 */
export async function createCssCtrlThemeCssFile(
  doc: vscode.TextDocument,
  diagCollection: vscode.DiagnosticCollection
) {
  if (!doc.fileName.endsWith('ctrl.theme.ts')) {
    return;
  }

  // ลบ Diagnostic เก่า (ถ้ามี)
  diagCollection.delete(doc.uri);

  const fileName = path.basename(doc.fileName);
  const baseName = fileName.replace(/\.ts$/, '');
  const currentDir = path.dirname(doc.fileName);
  const newCssFilePath = path.join(currentDir, baseName + '.css');

  if (!fs.existsSync(newCssFilePath)) {
    fs.writeFileSync(newCssFilePath, '', 'utf8');
  }

  const relImport = `./${baseName}.css`;
  const importLine = `import '${relImport}';\n`;

  const fullText = doc.getText();
  const oldRegex = new RegExp(`^import\\s+["'][^"']*${baseName}\\.css["'];?\\s*(?:\\r?\\n)?`, 'm');
  let newText = fullText.replace(oldRegex, '');
  newText = newText.replace(/\n{2,}/g, '\n');
  const finalText = importLine + newText;

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    doc.lineAt(doc.lineCount - 1).range.end
  );
  edit.replace(doc.uri, fullRange, finalText);
  await vscode.workspace.applyEdit(edit);

  let generatedCss: string;
  try {
    generatedCss = generateCssCtrlThemeCssFromSource(finalText.replace(importLine, ''));
  } catch (err: any) {
    // แสดง error ใน Problems
    const diag: vscode.Diagnostic = {
      message: err.message,
      severity: vscode.DiagnosticSeverity.Error,
      range: new vscode.Range(0, 0, 0, 0),
      source: 'CSS-CTRL Theme',
    };
    diagCollection.set(doc.uri, [diag]);

    vscode.window.showErrorMessage(`CSS-CTRL theme parse error: ${err.message}`);
    throw err;
  }

  const formattedCss = await formatCss(generatedCss);

  fs.writeFileSync(newCssFilePath, formattedCss, 'utf8');
}
