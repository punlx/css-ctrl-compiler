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
 * (2) buildKeyframesCSS จาก keyframeBlocks + keyframeNameMap
 *    ใช้ parseKeyframeBody เพื่อ parse เนื้อในแต่ละ keyframe
 */
export function buildKeyframesCSS(
  keyframeBlocks: IKeyframeBlock[],
  keyframeNameMap: Map<string, string>,
  scopeName: string
): string {
  if (!keyframeBlocks || keyframeBlocks.length === 0) {
    return '';
  }
  let out = '';
  for (const kb of keyframeBlocks) {
    const finalKfName = keyframeNameMap.get(kb.name)!;
    const steps = parseKeyframeBody(kb.rawBlock, finalKfName, scopeName);
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
 * (3) parseKeyframeBody:
 *    เดิมใช้ Regex จับทีละบรรทัด => ไม่รองรับ multiline
 *    (UPDATED) เปลี่ยนมา merge ไลน์ด้วย parenCount เพื่อรองรับ from(\n bg[red]\n)
 *    (ADDED) เช็คว่าห้ามมี certain states/pseudos/screen/container + @use/@bind/@query/ '>' ในเนื้อ
 */
export function parseKeyframeBody(
  rawBlock: string,
  finalKfName: string,
  scopeName: string
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

  // (NEW) mergeLineForKeyframe => รวมข้อความจนกว่าจะพบปิดวงเล็บ
  const mergedLines = mergeLineForKeyframe(lines);

  const stepList: Array<{ label: string; styleDef: IStyleDefinition }> = [];
  const rootVars: Record<string, string> = {};

  // (NEW) สร้างชุดคำที่ห้ามใช้ใน keyframe step
  const forbiddenList = [
    ...knownStates,   // hover, focus, active, ...
    ...supportedPseudos, // before, after, ...
    'screen',
    'container'
  ];

  for (const merged of mergedLines) {
    // ตัวอย่าง merged => "from(bg[red] c[white])"
    // หรือ "50%(bg[green])"
    // เราแยกหา label + body
    const match = merged.match(/^([0-9]{1,3}%|from|to)\s*\(([\s\S]+)\)$/);
    if (!match) {
      throw new Error(`[CSS-CTRL-ERR] Invalid keyframe syntax: "${merged}"`);
    }
    const label = match[1];
    const abbrPart = match[2].trim();

    // (ADDED) เช็คไม่ให้มี @use, @bind, @query, หรือ '>' ภายใน keyframe
    if (
      abbrPart.includes('@') ||
      abbrPart.includes('>')
    ) {
      throw new Error(
        `[CSS-CTRL-ERR] Not allowed usage inside keyframe step "${label}". Found one of "@use", "@bind", "@query", or ">".`
      );
    }

    // (ADDED) เช็คไม่ให้มี states/pseudos/screen/container + '('
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

    // เช็ค local var (--&) อีกที
    if (abbrPart.includes('--&')) {
      throw new Error(
        `[CSS-CTRL-ERR] local var (--&xxx) not allowed in @keyframe. Found in step "${label}".`
      );
    }

    // แยก token DSL แล้ว parse ลง stepDef
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

        // replace ใน base
        for (const p in stepDef.base) {
          const pat = `var(--${varName})`;
          stepDef.base[p] = stepDef.base[p].replace(pat, `var(${finalVarName})`);
        }
      }
      delete stepDef.varBase;
    }

    stepList.push({ label, styleDef: stepDef });
  }

  return { stepList, rootVars };
}

/**
 * (NEW) mergeLineForKeyframe
 *    รวมหลายบรรทัดจนกว่าจะเจอเครื่องหมายปิดวงเล็บครบ
 *    ใช้ parenCount++ เมื่อเจอ '(' และ parenCount-- เมื่อเจอ ')'
 *    เพื่อรองรับ from(\n bg[red]\n c[white]\n) => บรรทัดเดียว
 */
function mergeLineForKeyframe(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;
  let inCssFunc = false; // ถ้าเจอ rgb(, hsl(, url(, etc. ต้องไม่นับเพิ่ม/ลด parenCount

  // ฟังก์ชันช่วยเช็คว่าเป็นฟังก์ชัน CSS หรือไม่
  function isCssFuncAhead(str: string): boolean {
    // ตัวอย่าง pattern: /^(rgba?|hsla?|url|var|calc|clamp|...)
    // เอาแบบง่าย ๆ ข้างล่าง
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

    // สแกนตัวอักษรใน ln
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
