import { IStyleDefinition } from '../types';

export function transformLocalVariables(
  styleDef: IStyleDefinition,
  displayName: string // e.g. "box_abCdE" or "app_box"
): void {
  if (!styleDef.localVars) {
    return;
  }

  // ประกาศ final local vars
  const localVarProps: Record<string, string> = {};

  for (const varName in styleDef.localVars) {
    const rawVal = styleDef.localVars[varName];
    // e.g. --color-box_abCdE
    const finalVarName = `--${varName}-${displayName}`;
    localVarProps[finalVarName] = rawVal;
  }

  (styleDef as any)._resolvedLocalVars = localVarProps;

  // replace placeholder LOCALVAR(...) => var(--xxx)
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
