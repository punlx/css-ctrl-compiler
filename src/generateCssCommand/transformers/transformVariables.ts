// src/generateCssCommand/transformers/transformVariables.ts

import { IStyleDefinition } from '../types';

export function transformVariables(
  styleDef: IStyleDefinition,
  displayName: string, // e.g. "box_AbCdE" or "app_card"
  scopeName: string // (NEW) รับ scopeName เข้ามาเพื่อตรวจเงื่อนไข
): void {
  // (NEW) ถ้า scope=none => ถ้า styleDef.hasRuntimeVar => throw error
  if (scopeName === 'none' && styleDef.hasRuntimeVar) {
    throw new Error(`[CSS-CTRL-ERR] $variable is not allowed in scope=none.`);
  }

  // Base variables (varBase)
  if (styleDef.varBase) {
    for (const varName in styleDef.varBase) {
      const rawValue = styleDef.varBase[varName];
      // final var name => --varName-displayName
      const finalVarName = `--${varName}-${displayName}`;

      styleDef.rootVars = styleDef.rootVars || {};
      styleDef.rootVars[finalVarName] = rawValue;

      for (const cssProp in styleDef.base) {
        // replace var(--varName) => var(--varName-displayName)
        const pattern = `var(--${varName})`;
        styleDef.base[cssProp] = styleDef.base[cssProp].replace(pattern, `var(${finalVarName})`);
      }
    }
  }

  // State variables (varStates)
  if (styleDef.varStates) {
    for (const stName in styleDef.varStates) {
      const varsOfThatState: Record<string, string> = styleDef.varStates[stName] || {};
      for (const varName in varsOfThatState) {
        const rawValue = varsOfThatState[varName];
        // final var name => --varName-displayName-stName
        const finalVarName = `--${varName}-${displayName}-${stName}`;

        styleDef.rootVars = styleDef.rootVars || {};
        styleDef.rootVars[finalVarName] = rawValue;

        const stateProps = styleDef.states[stName];
        if (stateProps) {
          for (const cssProp in stateProps) {
            const pat = `var(--${varName}-${stName})`;
            stateProps[cssProp] = stateProps[cssProp].replace(pat, `var(${finalVarName})`);
          }
        }
      }
    }
  }

  // Pseudo variables (varPseudos)
  if (styleDef.varPseudos) {
    for (const pseudoName in styleDef.varPseudos) {
      const pseudoVars: Record<string, string> = styleDef.varPseudos[pseudoName] || {};
      for (const varName in pseudoVars) {
        const rawValue = pseudoVars[varName];
        // final var => --varName-displayName-pseudoName
        const finalVarName = `--${varName}-${displayName}-${pseudoName}`;

        styleDef.rootVars = styleDef.rootVars || {};
        styleDef.rootVars[finalVarName] = rawValue;

        const pseudoProps = styleDef.pseudos[pseudoName];
        if (pseudoProps) {
          for (const cssProp in pseudoProps) {
            const pat = `var(--${varName}-${pseudoName})`;
            pseudoProps[cssProp] = pseudoProps[cssProp].replace(pat, `var(${finalVarName})`);
          }
        }
      }
    }
  }
}
