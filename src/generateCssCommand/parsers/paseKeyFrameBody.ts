// src/generateCssCommand/parsers/paseKeyFrameBody.ts

import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { IKeyframeBlock, IStyleDefinition } from '../types';
import { parseSingleAbbr } from './parseSingleAbbr';
import { knownStates } from '../constants/knownStates'; // (NEW) import knownStates
import { supportedPseudos } from '../constants/supportedPseudos'; // (NEW) import supportedPseudos

/**
 * (1) buildKeyframeNameMap
 *    สร้าง map original keyframe name -> final keyframe name
 *    เช่น scope=app => "kf1" => "app_kf1"
 */
export function buildKeyframeNameMap(keyframeBlocks: IKeyframeBlock[], scopeName: string) {
  const map = new Map<string, string>();
  const nameSet = new Set<string>();
  for (const kb of keyframeBlocks) {
    if (nameSet.has(kb.name)) {
      throw new Error(`[CSS-CTRL-ERR] Duplicate keyframe name "${kb.name}" in the same file.`);
    }
    nameSet.add(kb.name);
    const finalName = scopeName === 'none' ? kb.name : `${scopeName}_${kb.name}`;
    map.set(kb.name, finalName);
  }
  return map;
}

/**
 * (2) buildKeyframesCSS
 *    เพิ่มพารามิเตอร์ varDefs เพื่อจะได้ transform SCOPEVAR(...) => var(--...-scopeName)
 */
export function buildKeyframesCSS(
  keyframeBlocks: IKeyframeBlock[],
  keyframeNameMap: Map<string, string>,
  scopeName: string,
  varDefs: Array<{ varName: string; rawValue: string }> // (NEW) เพิ่มเข้ามา
): string {
  if (!keyframeBlocks || keyframeBlocks.length === 0) {
    return '';
  }
  let out = '';
  for (const kb of keyframeBlocks) {
    const finalKfName = keyframeNameMap.get(kb.name)!;

    // (UPDATED) ส่ง varDefs ไป parseKeyframeBody ด้วย
    const steps = parseKeyframeBody(kb.rawBlock, finalKfName, scopeName, varDefs);

    // ประกาศ rootVar ถ้ามี
    let rootVarBlock = '';
    for (const rv in steps.rootVars) {
      rootVarBlock += `${rv}:${steps.rootVars[rv]};`;
    }
    if (rootVarBlock) {
      out += `:root{${rootVarBlock}}`;
    }

    // สร้างเนื้อ @keyframes
    let kfBody = '';
    for (const step of steps.stepList) {
      let propsStr = '';
      for (const prop in step.styleDef.base) {
        propsStr += `${prop}:${step.styleDef.base[prop]};`;
      }
      kfBody += `${step.label}{${propsStr}}`;
    }
    out += `@keyframes ${finalKfName}{${kfBody}}`;
  }
  return out;
}

/**
 * (3) parseKeyframeBody
 *    - รับ varDefs เพื่อเราจะทำการ transform SCOPEVAR(...) => var(--xxx-scopeName) ภายใน keyframe
 *    - ยังคงไม่อนุญาตบางอย่าง เช่น @use, @bind, @query, > และไม่อนุญาต state/pseudo/screen/container
 */
export function parseKeyframeBody(
  rawBlock: string,
  finalKfName: string,
  scopeName: string,
  varDefs: Array<{ varName: string; rawValue: string }>
): {
  stepList: Array<{
    label: string;
    styleDef: IStyleDefinition;
  }>;
  rootVars: Record<string, string>;
} {
  const lines = rawBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // รวมบรรทัดด้วย parenCount
  const mergedLines = mergeLineForKeyframe(lines);

  const stepList: Array<{ label: string; styleDef: IStyleDefinition }> = [];
  const rootVars: Record<string, string> = {};

  // ไลส์ต์สิ่งที่ไม่อนุญาต
  const forbiddenList = [
    ...knownStates,   // hover, focus, active, ...
    ...supportedPseudos, // before, after, ...
    'screen',
    'container',
  ];

  for (const merged of mergedLines) {
    const match = merged.match(/^([0-9]{1,3}%|from|to)\s*\(([\s\S]+)\)$/);
    if (!match) {
      throw new Error(`[CSS-CTRL-ERR] Invalid keyframe syntax: "${merged}"`);
    }
    const label = match[1];
    const abbrPart = match[2].trim();

    // ห้ามใช้ @use, @bind, @query, หรือ '>'
    if (
      abbrPart.includes('@use') ||
      abbrPart.includes('@bind') ||
      abbrPart.includes('@query') ||
      abbrPart.includes('>')
    ) {
      throw new Error(
        `[CSS-CTRL-ERR] Not allowed usage inside keyframe step "${label}". Found one of "@use", "@bind", "@query", or ">".`
      );
    }

    // ห้ามใช้ states/pseudos/screen/container + '('
    for (const forbidden of forbiddenList) {
      const needle = `${forbidden}(`;
      if (abbrPart.includes(needle)) {
        throw new Error(
          `[CSS-CTRL-ERR] Not allowed usage "${forbidden}(...)" inside keyframe step "${label}".`
        );
      }
    }

    // สร้าง styleDef สำหรับ step นี้
    const stepDef = createEmptyStyleDef();

    // ห้าม local var --&xxx
    if (abbrPart.includes('--&')) {
      throw new Error(
        `[CSS-CTRL-ERR] local var (--&xxx) not allowed in @keyframe. Found in step "${label}".`
      );
    }

    // parse DSL
    const tokens = abbrPart.split(/ (?=[^\[\]]*(?:\[|$))/);
    for (const tk of tokens) {
      parseSingleAbbr(tk, stepDef, false, false, false, undefined);
    }

    // ถ้ามี varBase => ประกาศลง root var + replace
    if (stepDef.varBase) {
      for (const varName in stepDef.varBase) {
        const rawVal = stepDef.varBase[varName];
        const cleanLabel = label.replace('%', '');
        const finalVarName =
          scopeName === 'none'
            ? `--${varName}-${finalKfName}-${cleanLabel}`
            : `--${varName}-${scopeName}_${finalKfName}-${cleanLabel}`;
        rootVars[finalVarName] = rawVal;

        for (const p in stepDef.base) {
          const pat = `var(--${varName})`;
          stepDef.base[p] = stepDef.base[p].replace(pat, `var(${finalVarName})`);
        }
      }
      delete stepDef.varBase;
    }

    // (NEW) ตรงนี้ทำการแทนที่ SCOPEVAR(...) => var(--xxx-scopeName)
    doTransformScopeVarsInKeyframe(stepDef, scopeName, varDefs);

    stepList.push({ label, styleDef: stepDef });
  }

  return { stepList, rootVars };
}

/**
 * (NEW) doTransformScopeVarsInKeyframe
 *    แทนที่ SCOPEVAR(xxx) => var(--xxx-scopeName) เหมือนกับใน class
 *    โดยเช็คว่ามีการประกาศ @var ไหม (varDefs)
 */
function doTransformScopeVarsInKeyframe(
  styleDef: IStyleDefinition,
  scopeName: string,
  varDefs: Array<{ varName: string; rawValue: string }>
) {
  const declaredVars = new Set(varDefs.map((v) => v.varName));
  const re = /SCOPEVAR\(([\w-]+)\)/g;

  function doReplace(str: string): string {
    return str.replace(re, (_, name) => {
      if (!declaredVars.has(name)) {
        throw new Error(
          `[CSS-CTRL-ERR] Using @${name} but not declared with @var ${name}[...]. (in keyframe)`
        );
      }
      return `var(--${name}-${scopeName})`;
    });
  }

  // base
  for (const prop in styleDef.base) {
    styleDef.base[prop] = doReplace(styleDef.base[prop]);
  }
}

/**
 * รวมหลายบรรทัดจนกว่าจะเจอเครื่องหมายปิดวงเล็บครบ
 */
function mergeLineForKeyframe(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;
  let inCssFunc = false;

  function isCssFuncAhead(str: string): boolean {
    const testStr = str.toLowerCase();
    return /(rgba?|hsla?|url|var|calc|hsl|rgb|clamp|linear-gradient|repeat)\($/.test(testStr);
  }

  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    i++;

    if (!buffer) {
      buffer = ln;
    } else {
      buffer += ' ' + ln;
    }

    for (let j = 0; j < ln.length; j++) {
      const ch = ln[j];
      if (ch === '(') {
        const slice = ln.slice(Math.max(0, j - 10), j + 1);
        if (isCssFuncAhead(slice)) {
          inCssFunc = true;
        } else {
          if (!inCssFunc) {
            parenCount++;
          }
        }
      } else if (ch === ')') {
        if (inCssFunc) {
          inCssFunc = false;
        } else {
          parenCount--;
        }
      }
    }

    if (parenCount <= 0) {
      if (parenCount < 0) {
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found in keyframe DSL. line="${ln}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
      inCssFunc = false;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error('[CSS-CTRL-ERR] Missing closing ")" in keyframe DSL.');
    }
    result.push(buffer);
  }

  return result;
}
