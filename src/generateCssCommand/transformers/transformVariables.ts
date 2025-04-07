// src/generateCssCommand/transformers/transFormVariables.ts

import { IStyleDefinition } from '../types';

export function transFormVariables(
  styleDef: IStyleDefinition,
  scopeName: string,
  className: string
): void {
  // (1) เช็คถ้า scopeName === 'hash' => ปฏิบัติแบบเดียวกับ 'none'
  const isHashScope = scopeName === 'hash';
  const scopePart = scopeName === 'none' || isHashScope ? className : `${scopeName}_${className}`;

  // -----------------------------
  // Base variables (varBase)
  // -----------------------------
  if (styleDef.varBase) {
    for (const varName in styleDef.varBase) {
      const rawValue = styleDef.varBase[varName];
      const finalVarName = `--${varName}-${scopePart}`;

      styleDef.rootVars = styleDef.rootVars || {};
      styleDef.rootVars[finalVarName] = rawValue;

      for (const cssProp in styleDef.base) {
        styleDef.base[cssProp] = styleDef.base[cssProp].replace(
          `var(--${varName})`,
          `var(${finalVarName})`
        );
      }
    }
  }

  // -----------------------------
  // State variables (varStates)
  // -----------------------------
  if (styleDef.varStates) {
    for (const stName in styleDef.varStates) {
      const varsOfThatState: Record<string, string> = styleDef.varStates[stName] || {};
      for (const varName in varsOfThatState) {
        const rawValue = varsOfThatState[varName];
        const finalVarName = `--${varName}-${scopePart}-${stName}`;

        styleDef.rootVars = styleDef.rootVars || {};
        styleDef.rootVars[finalVarName] = rawValue;

        const stateProps = styleDef.states[stName];
        if (stateProps) {
          for (const cssProp in stateProps) {
            stateProps[cssProp] = stateProps[cssProp].replace(
              `var(--${varName}-${stName})`,
              `var(${finalVarName})`
            );
          }
        }
      }
    }
  }

  // -----------------------------
  // Pseudo variables (varPseudos)
  // -----------------------------
  if (styleDef.varPseudos) {
    for (const pseudoName in styleDef.varPseudos) {
      const pseudoVars: Record<string, string> = styleDef.varPseudos[pseudoName] || {};
      for (const varName in pseudoVars) {
        const rawValue = pseudoVars[varName];
        const finalVarName = `--${varName}-${scopePart}-${pseudoName}`;

        styleDef.rootVars = styleDef.rootVars || {};
        styleDef.rootVars[finalVarName] = rawValue;

        const pseudoProps = styleDef.pseudos[pseudoName];
        if (pseudoProps) {
          for (const cssProp in pseudoProps) {
            pseudoProps[cssProp] = pseudoProps[cssProp].replace(
              `var(--${varName}-${pseudoName})`,
              `var(${finalVarName})`
            );
          }
        }
      }
    }
  }
}
