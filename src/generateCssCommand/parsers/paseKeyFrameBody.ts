// src/generateCssCommand/parsers/paseKeyFrameBody.ts

import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { IKeyframeBlock, IStyleDefinition } from '../types';
import { parseSingleAbbr } from './parseSingleAbbr';

/**
 * (1) สร้าง map original keyframe name -> final keyframe name
 * เช่น scope=app => "kf1" => "app_kf1"
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
 * ใช้ parseKeyframeBody เพื่อ parse เนื้อในแต่ละ keyframe
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
 * - ดึงบรรทัดภายใน block @keyframe { ... }
 * - แต่ละบรรทัดต้องอยู่ในรูปแบบ 0%(bg[red]) หรือ from(bg[...]) เป็นต้น
 * - สร้าง styleDef ของแต่ละ step => รวมเป็น stepList
 * - ถ้ามี varBase => ประกาศใน rootVars และแทนที่ใน base
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
  const stepList: Array<{ label: string; styleDef: IStyleDefinition }> = [];
  const rootVars: Record<string, string> = {};

  for (const ln of lines) {
    // ตัวอย่าง: 0%(bg[red]) / 50%(...) / from(...) / to(...)
    const match = ln.match(/^([0-9]{1,3}%|from|to)\s*\(([\s\S]*?)\)$/);
    if (!match) {
      throw new Error(`[CSS-CTRL-ERR] Invalid keyframe syntax: "${ln}"`);
    }
    const label = match[1];
    const abbrPart = match[2].trim();

    // สร้าง styleDef สำหรับ step นี้
    const stepDef = createEmptyStyleDef();

    // ไม่อนุญาต local var (--&) และ @use ภายใน keyframe
    if (abbrPart.includes('--&')) {
      throw new Error(`[CSS-CTRL-ERR] local var (--&xxx) not allowed in @keyframe. Found: "${ln}"`);
    }
    if (abbrPart.startsWith('@use')) {
      throw new Error(`[CSS-CTRL-ERR] @use not allowed in @keyframe. Found: "${ln}"`);
    }

    // แยกแต่ละ abbreviation แล้ว parse ลงใน stepDef
    const tokens = abbrPart.split(/ (?=[^\[\]]*(?:\[|$))/);
    for (const tk of tokens) {
      parseSingleAbbr(tk, stepDef, false, false, false, undefined);
    }

    // ถ้ามี varBase => ประกาศลง root var + replace
    if (stepDef.varBase) {
      for (const varName in stepDef.varBase) {
        const rawVal = stepDef.varBase[varName];
        const cleanLabel = label.replace('%', '');
        // ใช้ pattern ที่สอดคล้องกับ scopeName / finalKfName / step
        const finalVarName =
          scopeName === 'none'
            ? `--${varName}-${finalKfName}-${cleanLabel}`
            : `--${varName}-${scopeName}_${finalKfName}-${cleanLabel}`;

        rootVars[finalVarName] = rawVal;

        // replace ใน base
        const pat = `var(--${varName})`;
        for (const p in stepDef.base) {
          stepDef.base[p] = stepDef.base[p].replace(pat, `var(${finalVarName})`);
        }
      }
      delete stepDef.varBase;
    }

    stepList.push({ label, styleDef: stepDef });
  }

  return { stepList, rootVars };
}
