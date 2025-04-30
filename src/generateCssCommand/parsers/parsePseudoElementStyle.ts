// src/generateCssCommand/parsers/parsePseudoElementStyle.ts

import { abbrMap } from '../constants/abbrMap';
import { globalTypographyDict } from '../../extension';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';

// ADDED for theme.property
import { globalDefineMap } from '../createCssCtrlCssCommand';

export function parsePseudoElementStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false
) {
  const openParenIdx = abbrLine.indexOf('(');
  const pseudoName = abbrLine.slice(0, openParenIdx).trim();
  const inside = abbrLine.slice(openParenIdx + 1, -1).trim();
  const propsInPseudo = inside.split(/ (?=[^\[\]]*(?:\[|$))/);

  const result: Record<string, string> = styleDef.pseudos[pseudoName] || {};
  styleDef.varPseudos = styleDef.varPseudos || {};
  styleDef.varPseudos[pseudoName] = styleDef.varPseudos[pseudoName] || {};

  for (const p of propsInPseudo) {
    const { line: tokenNoBang, isImportant } = detectImportantSuffix(p);
    if (isConstContext && isImportant) {
      throw new Error(
        `[CSS-CTRL-ERR] !important is not allowed in @const block. Found: "${abbrLine}"`
      );
    }
    const [abbr, val] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;

    if (abbr === 'ct') {
      // content
      result['content'] = `"${val}"` + (isImportant ? ' !important' : '');
      continue;
    }

    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      // ถ้า isQueryBlock && abbr2.startsWith('$') => throw
      if (isQueryBlock && abbr2.startsWith('$')) {
        throw new Error(
          `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${ex}"`
        );
      }

      // (NEW) plain local var => "--xxx"
      if (abbr2.startsWith('--') && !abbr2.startsWith('--&')) {
        // e.g. --color[red]
        const rawName = abbr2.slice(2);
        if (!rawName) {
          throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${ex}"`);
        }
        // เก็บ plainLocalVars
        if (!(styleDef as any).plainLocalVars) {
          (styleDef as any).plainLocalVars = {};
        }
        (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(val2);
        continue;
      }

      const isVariable = abbr2.startsWith('$');
      const realAbbr = isVariable ? abbr2.slice(1) : abbr2;

      if (isVariable && realAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }

      if (realAbbr === 'ty') {
        const typKey = val2.trim();
        if (!globalTypographyDict[typKey]) {
          throw new Error(
            `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) for pseudo ${pseudoName}.`
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
              `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (pseudo:${pseudoName}). (ty[${typKey}])`
            );
          }
          const finalVal = convertCSSVariable(subVal);
          if (typeof cProp === 'string') {
            result[cProp] = finalVal + (tkImp ? ' !important' : '');
          } else {
            for (const propName of cProp) {
              result[propName] = finalVal + (tkImp ? ' !important' : '');
            }
          }
        }
        continue;
      }

      // ---------------------------------------------------------
      // ก่อนแก้ไข โค้ดเดิมมีแค่:
      //   const def = abbrMap[realAbbr as keyof typeof abbrMap];
      //   if (!def) { throw error }
      //   ...
      // แก้เพิ่ม fallback ไปหา theme.property
      // ---------------------------------------------------------
      const def = abbrMap[realAbbr as keyof typeof abbrMap];
      if (!def) {
        // ADDED for theme.property fallback
        if (realAbbr in globalDefineMap) {
          const subKey = val2.trim();
          if (!globalDefineMap[realAbbr][subKey]) {
            throw new Error(
              `[CSS-CTRL-ERR] "${realAbbr}[${subKey}]" not found in theme.property(...) for pseudo ${pseudoName}.`
            );
          }
          const partialDef = globalDefineMap[realAbbr][subKey];
          // เอาเฉพาะ partialDef.base => ใส่ใน pseudo
          for (const propKey in partialDef.base) {
            result[propKey] = partialDef.base[propKey] + (isImportant ? ' !important' : '');
          }
          continue;
        } else {
          throw new Error(
            `[CSS-CTRL-ERR] "${realAbbr}" not found in abbrMap or theme.property(...) for pseudo-element ${pseudoName}.`
          );
        }
      }

      // ---------------------------------------------------------
      // เคสปกติ: เจอใน abbrMap
      // ---------------------------------------------------------
      const finalVal = convertCSSVariable(val2);

      if (isVariable) {
        styleDef.varPseudos[pseudoName]![realAbbr] = finalVal;

        if (Array.isArray(def)) {
          for (const propName of def) {
            result[propName] =
              `var(--${realAbbr}-${pseudoName})` + (isImportant ? ' !important' : '');
          }
        } else {
          result[def] = `var(--${realAbbr}-${pseudoName})` + (isImportant ? ' !important' : '');
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

  styleDef.pseudos[pseudoName] = result;
}
