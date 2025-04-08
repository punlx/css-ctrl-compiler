// src/generateCssCommand/builders/buildCssText.ts

import { IStyleDefinition } from '../types';

/**
 * สร้าง CSS text จาก styleDef รวม base/states/screens/pseudos
 * + (ใหม่) เรียก buildNestedQueryCss ถ้ามี nestedQueries
 */
export function buildCssText(displayName: string, styleDef: IStyleDefinition): string {
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

  // base
  let baseProps = '';
  const localVars = (styleDef as any)._resolvedLocalVars as Record<string, string> | undefined;
  if (localVars) {
    for (const localVarName in localVars) {
      baseProps += `${localVarName}:${localVars[localVarName]};`;
    }
  }
  if (Object.keys(styleDef.base).length > 0) {
    for (const prop in styleDef.base) {
      baseProps += `${prop}:${styleDef.base[prop]};`;
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
      props += `${p}:${obj[p]};`;
    }
    cssText += `.${displayName}:${state}{${props}}`;
  }

  // screens
  for (const scr of styleDef.screens) {
    let props = '';
    for (const p in scr.props) {
      props += `${p}:${scr.props[p]};`;
    }
    cssText += `@media only screen and ${scr.query}{.${displayName}{${props}}}`;
  }

  // containers
  for (const ctnr of styleDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      props += `${p}:${ctnr.props[p]};`;
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
        pseudoProps += `${prop}:${pseudoObj[prop]};`;
      }

      const pseudoSelector = `::${pseudoKey}`;
      cssText += `.${displayName}${pseudoSelector}{${pseudoProps}}`;
    }
  }

  // (OLD) queries => ลบหรือตัดออก, ไม่ใช้ buildQueryCssText อีก
  // if (styleDef.queries && styleDef.queries.length > 0) { ... }

  // (NEW) nestedQueries => สร้างด้วย buildNestedQueryCss
  if (styleDef.nestedQueries && styleDef.nestedQueries.length > 0) {
    for (const nq of styleDef.nestedQueries) {
      // @ts-ignore
      cssText += buildNestedQueryCss(displayName, nq);
    }
  }

  return cssText;
}

/**
 * buildNestedQueryCss - recursive
 */
function buildNestedQueryCss(
  parentSelector: string,
  node: {
    selector: string;
    styleDef: IStyleDefinition;
    children: any[];
  }
): string {
  const finalSelector = transformNestedSelector(parentSelector, node.selector);

  // สร้าง CSS ของ styleDef แต่ใช้ finalSelector
  let out = buildRawCssText(finalSelector, node.styleDef);

  // recursion children
  for (const c of node.children) {
    out += buildNestedQueryCss(finalSelector.replace(/^\./, ''), c);
    // หมายเหตุ: ข้างบน .replace(/^\./, '') ทำให้เราถอดจุดหน้าออก
    //           เพื่อส่งไปเป็น parentSel (เช่น "box .box2") แทน ".box .box2"
  }

  return out;
}

/**
 * ถ้า childSel มี '&' => แทนด้วย ".parentSel"
 * ไม่งั้น => ".parentSel childSel"
 *
 * หมายเหตุ: parentSel เข้ามาเป็น "box", "box .box2", ฯลฯ โดยยังไม่มีจุดนำ
 *           แต่ตอน build base ใน buildCssText ใช้ ".box{...}"
 *           เราเลยใส่จุดในฟังก์ชันนี้
 */
function transformNestedSelector(parentSel: string, childSel: string): string {
  const trimmed = childSel.trim();
  if (trimmed.includes('&')) {
    return trimmed.replace(/&/g, `.${parentSel}`);
  }
  // default => .box .box2
  return `.${parentSel} ${trimmed}`;
}

/**
 * buildRawCssText - สร้าง CSS block จาก styleDef แต่ selector = finalSelector
 */
function buildRawCssText(finalSelector: string, styleDef: IStyleDefinition): string {
  let cssText = '';

  // base
  let baseProps = '';
  if ((styleDef as any)._resolvedLocalVars) {
    const lvs = (styleDef as any)._resolvedLocalVars as Record<string, string>;
    for (const localVarName in lvs) {
      baseProps += `${localVarName}:${lvs[localVarName]};`;
    }
  }
  for (const p in styleDef.base) {
    baseProps += `${p}:${styleDef.base[p]};`;
  }
  if (baseProps) {
    cssText += `${dotIfNeeded(finalSelector)}{${baseProps}}`;
  }

  // states
  for (const st in styleDef.states) {
    const obj = styleDef.states[st];
    let props = '';
    for (const p in obj) {
      props += `${p}:${obj[p]};`;
    }
    cssText += `${dotIfNeeded(finalSelector)}:${st}{${props}}`;
  }

  // screens
  for (const scr of styleDef.screens) {
    let props = '';
    for (const p in scr.props) {
      props += `${p}:${scr.props[p]};`;
    }
    cssText += `@media only screen and ${scr.query}{${dotIfNeeded(finalSelector)}{${props}}}`;
  }

  // containers
  for (const ctnr of styleDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      props += `${p}:${ctnr.props[p]};`;
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
        pseudoProps += `${prop}:${pseudoObj[prop]};`;
      }
      cssText += `${dotIfNeeded(finalSelector)}::${pseudoKey}{${pseudoProps}}`;
    }
  }

  return cssText;
}

/** ป้องกันกรณี finalSelector ไม่มีจุดนำ เช่น "box" หรือ "box .box2" */
function dotIfNeeded(sel: string) {
  // ถ้า sel เริ่มด้วย '.' อยู่แล้ว ให้คืนเหมือนเดิม
  if (sel.startsWith('.')) return sel;
  return '.' + sel;
}
