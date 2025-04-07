// src/generateCssCommand/transformers/transformLocalVariables.ts

import { IStyleDefinition } from '../types';

export function transformLocalVariables(
  styleDef: IStyleDefinition,
  scopeName: string,
  className: string
): void {
  if (!styleDef.localVars) {
    return;
  }

  // (NEW) เหมือนกัน
  const isHashScope = scopeName === 'hash';
  const scopePart = scopeName === 'none' || isHashScope ? className : `${scopeName}_${className}`;

  const localVarProps: Record<string, string> = {};

  for (const varName in styleDef.localVars) {
    const rawVal = styleDef.localVars[varName];
    const finalVarName = `--${varName}-${scopePart}`;
    localVarProps[finalVarName] = rawVal;
  }

  const placeholderRegex = /LOCALVAR\(([\w-]+)\)/g;
  const replacer = (match: string, p1: string): string => {
    const finalVarName = `--${p1}-${scopePart}`;
    return `var(${finalVarName})`;
  };

  for (const prop in styleDef.base) {
    styleDef.base[prop] = styleDef.base[prop].replace(placeholderRegex, replacer);
  }

  for (const stName in styleDef.states) {
    for (const prop in styleDef.states[stName]) {
      styleDef.states[stName][prop] = styleDef.states[stName][prop].replace(
        placeholderRegex,
        replacer
      );
    }
  }

  for (const pseudoName in styleDef.pseudos) {
    const obj = styleDef.pseudos[pseudoName];
    if (!obj) continue;
    for (const prop in obj) {
      obj[prop] = obj[prop].replace(placeholderRegex, replacer);
    }
  }

  for (const scr of styleDef.screens) {
    for (const prop in scr.props) {
      scr.props[prop] = scr.props[prop].replace(placeholderRegex, replacer);
    }
  }

  for (const ctnr of styleDef.containers) {
    for (const prop in ctnr.props) {
      ctnr.props[prop] = ctnr.props[prop].replace(placeholderRegex, replacer);
    }
  }

  (styleDef as any)._resolvedLocalVars = localVarProps;
}
