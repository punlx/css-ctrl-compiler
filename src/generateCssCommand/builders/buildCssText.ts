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

  // rootVars
  if (styleDef.rootVars) {
    let varBlock = '';
    for (const varName in styleDef.rootVars) {
      varBlock += `${varName}:${styleDef.rootVars[varName]};`;
    }
    if (varBlock) {
      cssText += `:root{${varBlock}}`;
    }
  }

  // base + localVars
  let baseProps = '';
  const localVars = (styleDef as any)._resolvedLocalVars as Record<string, string> | undefined;
  if (localVars) {
    // ประกาศ local var ของ block นี้ (top-level)
    for (const localVarName in localVars) {
      baseProps += `${localVarName}:${localVars[localVarName]};`;
    }
  }
  if (Object.keys(styleDef.base).length > 0) {
    for (const prop in styleDef.base) {
      const replacedVal = replaceLocalVarUsage(styleDef.base[prop], displayName);
      baseProps += `${prop}:${replacedVal};`;
    }
  }
  if (baseProps) {
    cssText += `.${displayName}{${baseProps}}`;
  }

  // states
  for (const state in styleDef.states) {
    const obj = styleDef.states[state];
    let props = '';
    for (const p in obj) {
      const replacedVal = replaceLocalVarUsage(obj[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `.${displayName}:${state}{${props}}`;
  }

  // screens
  for (const scr of styleDef.screens) {
    let props = '';
    for (const p in scr.props) {
      const replacedVal = replaceLocalVarUsage(scr.props[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `@media only screen and ${scr.query}{.${displayName}{${props}}}`;
  }

  // containers
  for (const ctnr of styleDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      const replacedVal = replaceLocalVarUsage(ctnr.props[p], displayName);
      props += `${p}:${replacedVal};`;
    }
    cssText += `@container ${ctnr.query}{.${displayName}{${props}}}`;
  }

  // pseudos
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

  // (OLD) styleDef.queries => (ไม่ใช้แล้ว)
  // (NEW) nestedQueries => recursive
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      // @ts-ignore
      cssText += buildNestedQueryCss(displayName, nq, displayName, shortNameToFinal, scopeName);
    }
  }

  return cssText;
}

/**
 * buildNestedQueryCss - สร้าง CSS สำหรับ @query แบบ nested
 * @param parentDisplayName : string ของ parent (เช่น "app_box", "box_AbCdE")
 * @param node : { selector, styleDef, children[] }
 * @param rootDisplayName : ใช้แทน LOCALVAR(...) (เพราะ localVar ผูกกับ displayName ของคลาสแม่)
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
  // (NEW) resolve placeholder "@scope.xxx" => "SCOPE_REF(...)"
  finalSelector = maybeResolveScopeRef(finalSelector, shortNameToFinal, scopeName);

  let out = buildRawCssText(finalSelector.replace(/^\./, ''), node.styleDef, rootDisplayName, shortNameToFinal, scopeName);

  for (const c of node.children) {
    // เปลี่ยน .xxx -> xxx เวลา pass ลงไป (เช่น .app_box .box1 -> 'app_box .box1')
    let childParent = finalSelector.replace(/^\./, '');
    out += buildNestedQueryCss(childParent, c, rootDisplayName, shortNameToFinal, scopeName);
  }

  return out;
}

/**
 * buildRawCssText - สร้าง CSS จาก styleDef 1 ชุด
 *   แต่แทน LOCALVAR(...) ด้วยข้อมูลจาก rootDisplayName
 */
function buildRawCssText(
  finalSelector: string,
  styleDef: IStyleDefinition,
  rootDisplayName: string,
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  let cssText = '';

  // localVars (ถ้ามี) - แต่ตาม design ไม่ควร
  let baseProps = '';
  const lvs = (styleDef as any)._resolvedLocalVars as Record<string, string> | undefined;
  if (lvs) {
    for (const localVarName in lvs) {
      baseProps += `${localVarName}:${lvs[localVarName]};`;
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
  for (const st in styleDef.states) {
    const obj = styleDef.states[st];
    let props = '';
    for (const p in obj) {
      props += `${p}:${replaceLocalVarUsage(obj[p], rootDisplayName)};`;
    }
    cssText += `${dotIfNeeded(finalSelector)}:${st}{${props}}`;
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

  // nested queries (recursive)
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      let sel2 = transformNestedSelector(finalSelector.replace(/^\./, ''), nq.selector);
      sel2 = maybeResolveScopeRef(sel2, shortNameToFinal, scopeName);

      // @ts-ignore
      cssText += buildRawCssText(sel2.replace(/^\./, ''), nq.styleDef, rootDisplayName, shortNameToFinal, scopeName);

      for (const c of nq.children) {
        const childParent = sel2.replace(/^\./, '');
      // @ts-ignore
        cssText += buildNestedQueryCss(childParent, c, rootDisplayName, shortNameToFinal, scopeName);
      }
    }
  }

  return cssText;
}

/** transformNestedSelector: "&" => .parentSel, otherwise => ".parentSel childSel" */
function transformNestedSelector(parentSel: string, childSel: string): string {
  const trimmed = childSel.trim();
  if (trimmed.includes('&')) {
    // e.g. &.box2 => .parentSel.box2
    return trimmed.replace(/&/g, `.${parentSel}`);
  }
  // default => .parentSel childSel
  return `.${parentSel} ${trimmed}`;
}

/** ป้องกันกรณี finalSelector ไม่มีจุด */
function dotIfNeeded(sel: string) {
  if (sel.startsWith('.')) return sel;
  return '.' + sel;
}

/**
 * replaceLocalVarUsage - แทน "LOCALVAR(varName)" เป็น "var(--varName-<displayName>)"
 */
function replaceLocalVarUsage(input: string, displayName: string): string {
  const placeholderRegex = /LOCALVAR\(([\w-]+)\)/g;
  return input.replace(placeholderRegex, (_, varName) => {
    return `var(--${varName}-${displayName})`;
  });
}

/** (NEW) ฟังก์ชัน resolveScopeRef - ใช้กับ selector ที่มี "SCOPE_REF(...)" */
function maybeResolveScopeRef(
  sel: string,
  shortNameToFinal: Map<string, string>,
  scopeName: string
): string {
  // regex: SCOPE_REF(...) แบบซ้อนหลายจุดก็ replace ทีละจุด
  const re = /SCOPE_REF\(([^)]+)\)/g;

  return sel.replace(re, (_, inside) => {
    const trimmed = inside.trim();
    if (!trimmed) {
      throw new Error(`[CSS-CTRL] SCOPE_REF(...) is empty.`);
    }
    // หา boundary ระหว่าง shortName กับ leftover (pseudo, space, etc.)
    // example: "card2:hover .child"
    const match = trimmed.match(/^[a-zA-Z0-9_-]+/);
    if (!match) {
      throw new Error(
        `[CSS-CTRL] Invalid selector after @scope.: "${trimmed}" (missing className at start?)`
      );
    }
    const shortName = match[0];
    const leftover = trimmed.slice(shortName.length); // อาจเป็น ":hover .child" หรือ "" ถ้าไม่มีต่อ

    // lookup finalName
    if (!shortNameToFinal.has(shortName)) {
      throw new Error(
        `[CSS-CTRL] Referencing "@scope.${shortName}" but no class ".${shortName}" is declared in this file.`
      );
    }
    const finalCls = shortNameToFinal.get(shortName)!;

    // ถ้า scope=none => finalCls = shortName (เหมือน parseClassBlocks)
    // แต่จริงๆ finalCls อาจเท่ากับ shortName อยู่แล้ว
    // leftover => เอาต่อท้ายได้เลย
    // return ".finalCls leftover"
    return `.${finalCls}${leftover}`;
  });
}
