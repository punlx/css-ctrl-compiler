// src/generateCssCommand/parsers/parseStateStyle.ts

import { abbrMap } from '../constants/abbrMap';
import { globalTypographyDict } from '../../extension';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';

// ADDED for theme.property
import { globalDefineMap } from '../createCssCtrlCssCommand';

export function parseStateStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false
) {
  const openParenIdx = abbrLine.indexOf('(');
  const funcName = abbrLine.slice(0, openParenIdx).trim();
  const inside = abbrLine.slice(openParenIdx + 1, -1).trim();

  const propsInState = inside.split(/ (?=[^\[\]]*(?:\[|$))/);
  const result: Record<string, string> = {};

  for (const p of propsInState) {
    const { line: tokenNoBang, isImportant } = detectImportantSuffix(p);
    if (isConstContext && isImportant) {
      throw new Error(
        `[CSS-CTRL-ERR] !important is not allowed in @const block. Found: "${abbrLine}"`
      );
    }

    // ----------------------------------------
    // แยก abbr / val
    // ----------------------------------------
    const [abbr, rawVal] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;

    // (NEW) replace @xxxx => SCOPEVAR(xxxx)
    let val = rawVal.replace(/@([\w-]+)/g, (_, vName) => `SCOPEVAR(${vName})`);

    // ----------------------------------------
    // expansions
    // ----------------------------------------
    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      if (isQueryBlock && abbr2.startsWith('$')) {
        throw new Error(
          `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${ex}"`
        );
      }

      if (abbr2.startsWith('--&') && isImportant) {
        throw new Error(
          `[CSS-CTRL-ERR] !important is not allowed with local var (${abbr2}) in state ${funcName}.`
        );
      }

      // (NEW) plain local var => "--xxx"
      if (abbr2.startsWith('--') && !abbr2.startsWith('--&')) {
        // e.g. --color[red]
        // เก็บเป็น plainLocalVars
        const rawName = abbr2.slice(2);
        if (!rawName) {
          throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${ex}"`);
        }
        // ไม่ห้ามใน state
        if (!(styleDef as any).plainLocalVars) {
          (styleDef as any).plainLocalVars = {};
        }
        (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(val2);
        continue;
      }

      const isVar = abbr2.startsWith('$');
      const realAbbr = isVar ? abbr2.slice(1) : abbr2;

      if (isVar && realAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }

      if (realAbbr === 'ty') {
        const typKey = val2.trim();
        if (!globalTypographyDict[typKey]) {
          throw new Error(
            `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) for state ${funcName}.`
          );
        }
        const styleStr = globalTypographyDict[typKey];
        const tokens = styleStr.split(/\s+/);
        for (const tk of tokens) {
          const { line: tkNoBang, isImportant: tkImp } = detectImportantSuffix(tk);
          const [subAbbr, subVal] = separateStyleAndProperties(tkNoBang);
          if (!subAbbr) continue;

          const cProp = abbrMap[subAbbr as keyof typeof abbrMap];
          if (!cProp) {
            throw new Error(
              `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap for state ${funcName} (ty[${typKey}]).`
            );
          }
          const valFinal = convertCSSVariable(subVal);
          result[typeof cProp === 'string' ? cProp : cProp[0]] =
            valFinal + (tkImp ? ' !important' : '');
        }
        continue;
      }

      const def = abbrMap[realAbbr as keyof typeof abbrMap];
      if (!def) {
        // fallback: check globalDefineMap
        if (realAbbr in globalDefineMap) {
          const subKey = val2.trim();
          if (!globalDefineMap[realAbbr][subKey]) {
            throw new Error(
              `[CSS-CTRL-ERR] "${realAbbr}[${subKey}]" not found in theme.property(...) for state ${funcName}.`
            );
          }
          const partialDef = globalDefineMap[realAbbr][subKey];
          for (const propKey in partialDef.base) {
            result[propKey] = partialDef.base[propKey] + (isImportant ? ' !important' : '');
          }
          continue;
        } else {
          throw new Error(
            `[CSS-CTRL-ERR] "${realAbbr}" not found in abbrMap or theme.property(...) for state ${funcName}.`
          );
        }
      }

      let finalVal = convertCSSVariable(val2);

      if (isVar) {
        styleDef.varStates = styleDef.varStates || {};
        styleDef.varStates[funcName] = styleDef.varStates[funcName] || {};
        styleDef.varStates[funcName][realAbbr] = finalVal;

        if (Array.isArray(def)) {
          for (const propName of def) {
            result[propName] =
              `var(--${realAbbr}-${funcName})` + (isImportant ? ' !important' : '');
          }
        } else {
          result[def] =
            `var(--${realAbbr}-${funcName})` + (isImportant ? ' !important' : '');
        }
      } else if (val2.includes('--&')) {
        const replaced = val2.replace(/--&([\w-]+)/g, (_, varName) => {
          return `LOCALVAR(${varName})`;
        });
        const valWithBang = replaced + (isImportant ? ' !important' : '');
        if (Array.isArray(def)) {
          for (const propName of def) {
            result[propName] = valWithBang;
          }
        } else {
          result[def] = valWithBang;
        }
      } else {
        const valWithBang = finalVal + (isImportant ? ' !important' : '');
        if (Array.isArray(def)) {
          for (const propName of def) {
            result[propName] = valWithBang;
          }
        } else {
          result[def] = valWithBang;
        }
      }
    }
  }

  styleDef.states[funcName] = result;
}
