import { IStyleDefinition } from '../types';

export function buildQueryCssText(
  parentDisplayName: string,
  selector: string,
  qDef: IStyleDefinition
): string {
  let out = '';

  // --------------------------------------------------------------------
  // helper function: transformSelector
  // ถ้า selector มี '&' => แทนที่ด้วย ".parentDisplayName"
  // ถ้าไม่มี => ใส่ ".parentDisplayName " ข้างหน้า
  // --------------------------------------------------------------------
  function transformSelector(rawSel: string): string {
    const selector = rawSel.trim();
    if (selector.includes('&')) {
      // e.g. "&:hover" => ".button_box:hover"
      return selector.replace(/&/g, '.' + parentDisplayName);
    } else {
      // e.g. ":hover" => ".button_box :hover"
      return `.${parentDisplayName} ${selector}`;
    }
  }

  // ----- base + local vars -----
  let baseProps = '';
  const localVars = (qDef as any)._resolvedLocalVars as Record<string, string> | undefined;
  if (localVars) {
    for (const localVarName in localVars) {
      baseProps += `${localVarName}:${localVars[localVarName]};`;
    }
  }
  if (Object.keys(qDef.base).length > 0) {
    for (const prop in qDef.base) {
      baseProps += `${prop}:${qDef.base[prop]};`;
    }
  }
  if (baseProps) {
    const finalSel = transformSelector(selector);
    out += `${finalSel}{${baseProps}}`;
  }

  // ----- states -----
  for (const state in qDef.states) {
    const obj = qDef.states[state];
    let props = '';
    for (const p in obj) {
      props += `${p}:${obj[p]};`;
    }
    // ปกติจะเขียน .parentDisplayName selector:state
    // แต่ถ้า selector มี &, จะรวมกันตาม transformSelector
    const finalSel = transformSelector(selector + `:${state}`);
    out += `${finalSel}{${props}}`;
  }

  // ----- screens -----
  for (const scr of qDef.screens) {
    let props = '';
    for (const p in scr.props) {
      props += `${p}:${scr.props[p]};`;
    }
    const finalSel = transformSelector(selector);
    out += `@media only screen and ${scr.query}{${finalSel}{${props}}}`;
  }

  // ----- containers -----
  for (const ctnr of qDef.containers) {
    let props = '';
    for (const p in ctnr.props) {
      props += `${p}:${ctnr.props[p]};`;
    }
    const finalSel = transformSelector(selector);
    out += `@container ${ctnr.query}{${finalSel}{${props}}}`;
  }

  // ----- pseudos -----
  if (qDef.pseudos) {
    for (const pseudoKey in qDef.pseudos) {
      const pseudoObj = qDef.pseudos[pseudoKey];
      if (!pseudoObj) continue;

      let pseudoProps = '';
      for (const prop in pseudoObj) {
        pseudoProps += `${prop}:${pseudoObj[prop]};`;
      }

      // selector + "::before" อะไรแบบนี้
      const finalSel = transformSelector(selector + `::${pseudoKey}`);
      out += `${finalSel}{${pseudoProps}}`;
    }
  }

  return out;
}
