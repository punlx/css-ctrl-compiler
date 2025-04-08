// src/generateCssCommand/parsers/parseStateStyle.ts

import { abbrMap } from '../../constants';
import { globalTypographyDict } from '../../extension';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';

export function parseStateStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false
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

    const [abbr, val] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;

    // --- (ลบบล็อกเดิมที่เคยเช็ก localVar) ---

    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      if (abbr2.startsWith('--&') && isImportant) {
        throw new Error(
          `[CSS-CTRL-ERR] !important is not allowed with local var (${abbr2}) in state ${funcName}.`
        );
      }

      // --- ลบบล็อกที่เคยโยน error เมื่อไม่เจอใน styleDef.localVars --- 
      // (เช่น if (!styleDef.localVars[varName]) throw new Error(...))

      const isVar = abbr2.startsWith('$');
      const realAbbr = isVar ? abbr2.slice(1) : abbr2;

      // ใช้งาน typography ?
      if (isVar && realAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }

      // ถ้าเป็น ty(...) ตรงนี้ก็เหมือนโค้ดเดิม; หรือ globalTypographyDict...
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
              `"${subAbbr}" not found in abbrMap for state ${funcName} (ty[${typKey}]).`
            );
          }
          const valFinal = convertCSSVariable(subVal);
          result[cProp] = valFinal + (tkImp ? ' !important' : '');
        }
        continue;
      }

      const cProp = abbrMap[realAbbr as keyof typeof abbrMap];
      if (!cProp) {
        throw new Error(
          `[CSS-CTRL-ERR] "${realAbbr}" not found in abbrMap for state ${funcName}.`
        );
      }

      let finalVal = convertCSSVariable(val2);
      if (isVar) {
        // varState
        styleDef.varStates = styleDef.varStates || {};
        styleDef.varStates[funcName] = styleDef.varStates[funcName] || {};
        styleDef.varStates[funcName][realAbbr] = finalVal;

        result[cProp] = `var(--${realAbbr}-${funcName})` + (isImportant ? ' !important' : '');
      } else if (val2.includes('--&')) {
        // ปล่อยให้ transform เป็น "LOCALVAR(varName)" (หรือแทนด้วย regex) 
        const replaced = val2.replace(/--&([\w-]+)/g, (_, varName) => {
          return `LOCALVAR(${varName})`;
        });
        result[cProp] = replaced + (isImportant ? ' !important' : '');
      } else {
        result[cProp] = finalVal + (isImportant ? ' !important' : '');
      }
    }
  }

  styleDef.states[funcName] = result;
}
