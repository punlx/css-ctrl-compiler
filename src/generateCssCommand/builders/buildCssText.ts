// src/generateCssCommand/builders/buildCssText.ts

import { IStyleDefinition } from '../types';

/**
 * สร้าง CSS text จาก styleDef รวม base/states/screens/pseudos
 * แล้ว (ใหม่) ถ้ามี styleDef.nestedQueries => ใช้ buildNestedQueryCss
 */
export function buildCssText(
  displayName: string,
  styleDef: IStyleDefinition,
  // (NEW) สำหรับ resolve @scope.xxx
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  let cssText = '';

  // --------------------------------------------------------------------
  // rootVars
  // --------------------------------------------------------------------
  if (styleDef.rootVars) {
    let varBlock = '';
    for (const varName in styleDef.rootVars) {
      varBlock += `${varName}:${styleDef.rootVars[varName]};`;
    }
    if (varBlock) {
      cssText += `:root{${varBlock}}`;
    }
  }

  // --------------------------------------------------------------------
  // base + localVars + (NEW) plainLocalVars
  // --------------------------------------------------------------------
  let baseProps = '';

  // (A) plainLocalVars => "--xxx"
  if ((styleDef as any).plainLocalVars) {
    const pv = (styleDef as any).plainLocalVars as Record<string, string>;
    for (const varName in pv) {
      baseProps += `${varName}:${pv[varName]};`;
    }
  }

  // (B) base properties
  if (Object.keys(styleDef.base).length > 0) {
    for (const prop in styleDef.base) {
      const replacedVal = replaceLocalVarUsage(styleDef.base[prop], displayName);
      baseProps += `${prop}:${replacedVal};`;
    }
  }
  if (baseProps) {
    cssText += `.${displayName}{${baseProps}}`;
  }

  // --------------------------------------------------------------------
  // states
  // --------------------------------------------------------------------
  for (const state in styleDef.states) {
    const obj = styleDef.states[state];
    let props = '';
    for (const p in obj) {
      const replacedVal = replaceLocalVarUsage(obj[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `.${displayName}:${state}{${props}}`;
  }

  // --------------------------------------------------------------------
  // screens
  // --------------------------------------------------------------------
  for (const scr of styleDef.screens) {
    let props = '';
    for (const p in scr.props) {
      const replacedVal = replaceLocalVarUsage(scr.props[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `@media only screen and ${scr.query}{.${displayName}{${props}}}`;
  }

  // --------------------------------------------------------------------
  // containers
  // --------------------------------------------------------------------
  for (const ctnr of styleDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      const replacedVal = replaceLocalVarUsage(ctnr.props[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `@container ${ctnr.query}{.${displayName}{${props}}}`;
  }

  // --------------------------------------------------------------------
  // pseudos
  // --------------------------------------------------------------------
  if (styleDef.pseudos) {
    for (const pseudoKey in styleDef.pseudos) {
      const pseudoObj = styleDef.pseudos[pseudoKey];
      if (!pseudoObj) continue;
      let pseudoProps = '';
      for (const prop in pseudoObj) {
        const replacedVal = replaceLocalVarUsage(pseudoObj[prop], displayName);
        pseudoProps += `${prop}:${replacedVal};`;
      }
      cssText += `.${displayName}::${pseudoKey}{${pseudoProps}}`;
    }
  }

  // --------------------------------------------------------------------
  // nestedQueries => recursive
  // --------------------------------------------------------------------
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      cssText += buildNestedQueryCss(displayName, nq, displayName, shortNameToFinal, scopeName);
    }
  }

  // --------------------------------------------------------------------
  // pluginStates ถ้ามี
  // --------------------------------------------------------------------
  if ((styleDef as any).pluginStates) {
    const pluginObj = (styleDef as any).pluginStates;
    for (const funcName in pluginObj) {
      const { classAttr, props } = pluginObj[funcName];
      let pluginProps = '';
      for (const p in props) {
        const replacedVal = replaceLocalVarUsage(props[p], displayName);
        pluginProps += `${p}:${replacedVal};`;
      }
      // แก้ให้ตรวจสอบก่อนว่า classAttr เริ่มด้วย '.' หรือ '[' เพื่อไม่ขึ้นต้นด้วยจุดซ้ำ
      const finalSelector = joinSelector(`.${displayName}`, classAttr);
      cssText += `${finalSelector}{${pluginProps}}`;
    }
  }

  // --------------------------------------------------------------------
  // pluginContainers ถ้ามี
  // --------------------------------------------------------------------
  if ((styleDef as any).pluginContainers) {
    const pcArr = (styleDef as any).pluginContainers;
    for (const pcObj of pcArr) {
      let containerProps = '';
      for (const p in pcObj.props) {
        const replacedVal = replaceLocalVarUsage(pcObj.props[p], displayName);
        containerProps += `${p}:${replacedVal};`;
      }
      // e.g. .drawerPluginContainer:has(.app_box){ ... }
      cssText += `.${pcObj.containerName}:has(.${displayName}){${containerProps}}`;
    }
  }

  return cssText;
}

/**
 * buildNestedQueryCss
 * @param parentDisplayName
 * @param node
 * @param rootDisplayName
 * @param shortNameToFinal
 * @param scopeName
 */
function buildNestedQueryCss(
  parentDisplayName: string,
  node: {
    selector: string;
    styleDef: IStyleDefinition;
    children: any[];
  },
  rootDisplayName: string,
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  let finalSelector = transformNestedSelector(parentDisplayName, node.selector);
  finalSelector = maybeResolveScopeRef(finalSelector, shortNameToFinal, scopeName);

  let out = buildRawCssText(
    finalSelector.replace(/^\./, ''),
    node.styleDef,
    rootDisplayName,
    shortNameToFinal,
    scopeName
  );

  for (const c of node.children) {
    let childParent = finalSelector.replace(/^\./, '');
    out += buildNestedQueryCss(childParent, c, rootDisplayName, shortNameToFinal, scopeName);
  }

  return out;
}

/**
 * buildRawCssText
 * สร้าง CSS จาก styleDef 1 ชุด
 */
function buildRawCssText(
  finalSelector: string,
  styleDef: IStyleDefinition,
  rootDisplayName: string,
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  let cssText = '';

  let baseProps = '';
  if ((styleDef as any).plainLocalVars) {
    const pv = (styleDef as any).plainLocalVars as Record<string, string>;
    for (const varName in pv) {
      baseProps += `${varName}:${pv[varName]};`;
    }
  }

  for (const p in styleDef.base) {
    const replacedVal = replaceLocalVarUsage(styleDef.base[p], rootDisplayName);
    baseProps += `${p}:${replacedVal};`;
  }
  if (baseProps) {
    cssText += `${dotIfNeeded(finalSelector)}{${baseProps}}`;
  }

  // states
  for (const stName in styleDef.states) {
    const obj = styleDef.states[stName];
    let props = '';
    for (const p in obj) {
      props += `${p}:${replaceLocalVarUsage(obj[p], rootDisplayName)};`;
    }
    cssText += `${dotIfNeeded(finalSelector)}:${stName}{${props}}`;
  }

  // screens
  for (const scr of styleDef.screens) {
    let props = '';
    for (const p in scr.props) {
      props += `${p}:${replaceLocalVarUsage(scr.props[p], rootDisplayName)};`;
    }
    cssText += `@media only screen and ${scr.query}{${dotIfNeeded(finalSelector)}{${props}}}`;
  }

  // containers
  for (const ctnr of styleDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      props += `${p}:${replaceLocalVarUsage(ctnr.props[p], rootDisplayName)};`;
    }
    cssText += `@container ${ctnr.query}{${dotIfNeeded(finalSelector)}{${props}}}`;
  }

  // pseudos
  if (styleDef.pseudos) {
    for (const pseudoKey in styleDef.pseudos) {
      const pseudoObj = styleDef.pseudos[pseudoKey];
      if (!pseudoObj) continue;
      let pseudoProps = '';
      for (const prop in pseudoObj) {
        pseudoProps += `${prop}:${replaceLocalVarUsage(pseudoObj[prop], rootDisplayName)};`;
      }
      cssText += `${dotIfNeeded(finalSelector)}::${pseudoKey}{${pseudoProps}}`;
    }
  }

  // (NEW) pluginStates ใน nested
  if ((styleDef as any).pluginStates) {
    const pluginObj = (styleDef as any).pluginStates;
    for (const funcName in pluginObj) {
      const { classAttr, props } = pluginObj[funcName];
      let pluginProps = '';
      for (const p in props) {
        pluginProps += `${p}:${replaceLocalVarUsage(props[p], rootDisplayName)};`;
      }
      // เดิมต่อเป็น `.${finalSelector}.${classAttr}` ทำให้บางเคสกลายเป็น .[role="..."]
      // แก้ไขโดยใช้ joinSelector
      const sel = dotIfNeeded(finalSelector);
      const finalSel = joinSelector(sel, classAttr);
      cssText += `${finalSel}{${pluginProps}}`;
    }
  }

  // (MODIFIED) pluginContainers ใน nested
  if ((styleDef as any).pluginContainers) {
    const pcArr = (styleDef as any).pluginContainers;
    for (const pcObj of pcArr) {
      let containerProps = '';
      for (const p in pcObj.props) {
        containerProps += `${p}:${replaceLocalVarUsage(pcObj.props[p], rootDisplayName)};`;
      }
      cssText += `.${pcObj.containerName}:has(${dotIfNeeded(finalSelector)}){${containerProps}}`;
    }
  }

  // recursive nestedQueries
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      let sel2 = transformNestedSelector(finalSelector.replace(/^\./, ''), nq.selector);
      sel2 = maybeResolveScopeRef(sel2, shortNameToFinal, scopeName);

      cssText += buildRawCssText(
        sel2.replace(/^\./, ''),
        nq.styleDef,
        rootDisplayName,
        shortNameToFinal,
        scopeName
      );

      for (const c of nq.children) {
        const childParent = sel2.replace(/^\./, '');
        cssText += buildNestedQueryCss(
          childParent,
          c,
          rootDisplayName,
          shortNameToFinal,
          scopeName
        );
      }
    }
  }

  return cssText;
}

/**
 * สร้าง selector สำหรับ nested block
 * ถ้า childSel มี '&' => แทนที่ด้วย .parentSel
 * ไม่งั้น => .parentSel childSel
 */
function transformNestedSelector(parentSel: string, childSel: string): string {
  const trimmed = childSel.trim();
  if (trimmed.includes('&')) {
    return trimmed.replace(/&/g, `.${parentSel}`);
  }
  return `.${parentSel} ${trimmed}`;
}

/**
 * ใส่จุดนำหน้า selector ถ้าจำเป็น
 */
function dotIfNeeded(sel: string) {
  if (sel.startsWith('.')) return sel;
  return '.' + sel;
}

/**
 * แทนที่ LOCALVAR(xxx) => var(--xxx-displayName)
 */
function replaceLocalVarUsage(input: string, displayName: string): string {
  const placeholderRegex = /LOCALVAR\(([\w-]+)\)/g;
  return input.replace(placeholderRegex, (_, varName) => {
    return `var(--${varName}-${displayName})`;
  });
}

/**
 * แทนที่ SCOPE_REF(shortName) => .<finalCls>
 */
function maybeResolveScopeRef(
  sel: string,
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  const re = /SCOPE_REF\(([^)]+)\)/g;
  return sel.replace(re, (_, inside) => {
    const trimmed = inside.trim();
    if (!trimmed) {
      throw new Error(`[CSS-CTRL] SCOPE_REF(...) is empty.`);
    }
    const match = trimmed.match(/^[a-zA-Z0-9_-]+/);
    if (!match) {
      throw new Error(
        `[CSS-CTRL] Invalid selector after @scope.: "${trimmed}" (missing className at start?)`
      );
    }
    const shortName = match[0];
    const leftover = trimmed.slice(shortName.length);
    if (!shortNameToFinal.has(shortName)) {
      throw new Error(
        `[CSS-CTRL] Referencing "@scope.${shortName}" but no class ".${shortName}" is declared in this file.`
      );
    }
    const finalCls = shortNameToFinal.get(shortName)!;
    return `.${finalCls}${leftover}`;
  });
}

function joinSelector(baseSelector: string, pluginSelector: string): string {
  const trimPlugin = pluginSelector.trim();
  if (!trimPlugin) return baseSelector;

  // ถ้าเริ่มด้วย '.' หรือ '[' => ติดกันได้เลย (ไม่ใส่จุดซ้ำ)
  if (trimPlugin.startsWith('.') || trimPlugin.startsWith('[')) {
    return `${baseSelector}${trimPlugin}`;
  }

  // กรณีอื่น ๆ => ใส่ '.' คั่น
  return `${baseSelector}.${trimPlugin.replace(/^\./, '')}`;
}
