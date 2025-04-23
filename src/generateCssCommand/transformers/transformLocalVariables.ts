// src/generateCssCommand/transformers/transformLocalVariables.ts

import { IStyleDefinition } from '../types';

export function transformLocalVariables(
  styleDef: IStyleDefinition,
  displayName: string, // e.g. "box_abCdE" or "app_box"
  scopeName: string
): void {
  // (1) ถ้า scope=none => ถ้ามี styleDef.localVars => throw error
  if (scopeName === 'none' && styleDef.localVars && Object.keys(styleDef.localVars).length > 0) {
    throw new Error(`[CSS-CTRL-ERR] local var (--&xxx) is not allowed in scope=none.`);
  }

  // (2) ถ้ามี localVars => ประกาศเป็น --xxx-displayName ใน :root
  if (styleDef.localVars) {
    for (const varName in styleDef.localVars) {
      const rawVal = styleDef.localVars[varName];
      const finalVarName = `--${varName}-${displayName}`;
      styleDef.rootVars = styleDef.rootVars || {};
      styleDef.rootVars[finalVarName] = rawVal;
    }
  }

  // ฟังก์ชันเล็ก ๆ สำหรับ replace LOCALVAR(xxx) => var(--xxx-displayName)
  const placeholderRegex = /LOCALVAR\(([\w-]+)\)/g;
  const replacer = (match: string, p1: string): string => {
    return `var(--${p1}-${displayName})`;
  };

  // (3) replace ใน base
  for (const prop in styleDef.base) {
    styleDef.base[prop] = styleDef.base[prop].replace(placeholderRegex, replacer);
  }

  // (4) replace ใน states
  for (const stName in styleDef.states) {
    const stObj = styleDef.states[stName];
    for (const prop in stObj) {
      stObj[prop] = stObj[prop].replace(placeholderRegex, replacer);
    }
  }

  // (5) replace ใน pseudos
  if (styleDef.pseudos) {
    for (const pseudoKey in styleDef.pseudos) {
      const pObj = styleDef.pseudos[pseudoKey];
      if (!pObj) continue;
      for (const prop in pObj) {
        pObj[prop] = pObj[prop].replace(placeholderRegex, replacer);
      }
    }
  }

  // (6) replace ใน screens
  for (const sc of styleDef.screens) {
    for (const prop in sc.props) {
      sc.props[prop] = sc.props[prop].replace(placeholderRegex, replacer);
    }
  }

  // (7) replace ใน containers
  for (const ctnr of styleDef.containers) {
    for (const prop in ctnr.props) {
      ctnr.props[prop] = ctnr.props[prop].replace(placeholderRegex, replacer);
    }
  }

  // (NEW) (8) replace ใน pluginStates => (styleDef as any).pluginStates[stateName].props
  if ((styleDef as any).pluginStates) {
    const pluginStates = (styleDef as any).pluginStates;
    for (const stKey in pluginStates) {
      const stObj = pluginStates[stKey];
      if (!stObj || !stObj.props) continue;
      for (const propKey in stObj.props) {
        stObj.props[propKey] = stObj.props[propKey].replace(placeholderRegex, replacer);
      }
    }
  }
}
