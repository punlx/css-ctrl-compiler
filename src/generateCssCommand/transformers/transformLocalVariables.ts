// src/generateCssCommand/transformers/transformLocalVariables.ts

import { IStyleDefinition } from '../types';

export function transformLocalVariables(
  styleDef: IStyleDefinition,
  displayName: string,  // e.g. "box_abCdE" or "app_box"
  scopeName: string     // (NEW) เพื่อเช็คเงื่อนไข scope=none
): void {
  // (1) ถ้า scope=none => ถ้าเจอ localVars => throw error
  if (scopeName === 'none' && styleDef.localVars && Object.keys(styleDef.localVars).length > 0) {
    throw new Error(`[CSS-CTRL-ERR] local var (--&xxx) is not allowed in scope=none.`);
  }

  if (!styleDef.localVars) {
    return;
  }

  // ประกาศ final local vars ลงใน :root (แทนที่จะประกาศในคลาส)
  for (const varName in styleDef.localVars) {
    const rawVal = styleDef.localVars[varName];
    // เดิมเคยเป็น --varName-displayName ในคลาส
    // ตอนนี้โยนไปไว้ใน :root
    const finalVarName = `--${varName}-${displayName}`;

    styleDef.rootVars = styleDef.rootVars || {};
    styleDef.rootVars[finalVarName] = rawVal;
  }

  // replace placeholder LOCALVAR(...) => var(--xxx-displayName)
  const placeholderRegex = /LOCALVAR\(([\w-]+)\)/g;
  const replacer = (match: string, p1: string): string => {
    const finalVarName = `--${p1}-${displayName}`;
    return `var(${finalVarName})`;
  };

  // แก้ใน base
  for (const prop in styleDef.base) {
    styleDef.base[prop] = styleDef.base[prop].replace(placeholderRegex, replacer);
  }

  // แก้ใน states
  for (const stName in styleDef.states) {
    const stObj = styleDef.states[stName];
    for (const prop in stObj) {
      stObj[prop] = stObj[prop].replace(placeholderRegex, replacer);
    }
  }

  // แก้ใน pseudos
  if (styleDef.pseudos) {
    for (const pseudoKey in styleDef.pseudos) {
      const pObj = styleDef.pseudos[pseudoKey];
      if (!pObj) continue;
      for (const prop in pObj) {
        pObj[prop] = pObj[prop].replace(placeholderRegex, replacer);
      }
    }
  }

  // แก้ใน screens
  for (const sc of styleDef.screens) {
    for (const prop in sc.props) {
      sc.props[prop] = sc.props[prop].replace(placeholderRegex, replacer);
    }
  }

  // แก้ใน containers
  for (const ctnr of styleDef.containers) {
    for (const prop in ctnr.props) {
      ctnr.props[prop] = ctnr.props[prop].replace(placeholderRegex, replacer);
    }
  }
}
