import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { abbrMap } from './constants/abbrMap'; // <-- import มาให้แล้ว เอาไปใช้เลย

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
): { cssText: string; varMap: Record<string, string>; defaultVars: Record<string, string> } {
  const regex = /([\w\-\$]+)\[(.*?)\]/g;
  let match: RegExpExecArray | null;

  let cssText = '';
  const varMap: Record<string, string> = {};
  const defaultVars: Record<string, string> = {};

  while ((match = regex.exec(abbrBody)) !== null) {
    let styleAbbr = match[1];
    let propVal = match[2];

    if (propVal.includes('--')) {
      propVal = propVal.replace(/(--[\w-]+)/g, 'var($1)');
    }

    let isVar = false;
    if (styleAbbr.startsWith('$')) {
      isVar = true;
      styleAbbr = styleAbbr.slice(1);
      if (styleAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }
    }

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

function parseKeyframeString(keyframeName: string, rawStr: string): string {
  const regex = /(\b(?:\d+%|from|to))\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  const blocks: Array<{ label: string; css: string }> = [];
  const defaultVarMap: Record<string, string> = {};

  while ((match = regex.exec(rawStr)) !== null) {
    const label = match[1];
    const abbrBody = match[2];

    const { cssText, varMap, defaultVars } = parseKeyframeAbbr(
      abbrBody.trim(),
      keyframeName,
      label
    );
    blocks.push({ label, css: cssText });
    Object.assign(defaultVarMap, defaultVars);
  }

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

function generateVariableCSS(variableMap: Record<string, string>): string {
  let rootBlock = '';
  for (const key in variableMap) {
    rootBlock += `--${key}:${variableMap[key]};`;
  }
  return rootBlock ? `:root{${rootBlock}}` : '';
}

// ---------------------------------------------------------------

interface IParseResult {
  palette: string[][] | null;
  variable: Record<string, string>;
  keyframe: Record<string, string>;
}

function parseCssCtrlThemeSource(sourceText: string): IParseResult {
  const result: IParseResult = {
    palette: null,
    variable: {},
    keyframe: {},
  };

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

  return result;
}

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

  return css;
}

export async function createCssCtrlThemeCssFile(doc: vscode.TextDocument) {
  if (!doc.fileName.endsWith('ctrl.theme.ts')) {
    return;
  }

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
  } catch (err) {
    vscode.window.showErrorMessage(`CSS-CTRL theme parse error: ${(err as Error).message}`);
    throw err;
  }

  fs.writeFileSync(newCssFilePath, generatedCss, 'utf8');
}
