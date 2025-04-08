// src/generateCssCommand/parsers/parseBaseStyle.ts

import { abbrMap } from '../../constants';
import { globalTypographyDict } from '../../extension';
import { globalDefineMap } from '../createCssCtrlCssCommand';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { parseSingleAbbr } from './parseSingleAbbr';

/** parseBaseStyle **/
export function parseBaseStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false
) {
  const { line: abbrLineNoBang, isImportant } = detectImportantSuffix(abbrLine);
  if (isConstContext && isImportant) {
    throw new Error(
      `[CSS-CTRL-ERR] !important is not allowed in @const (or theme.define) block. Found: "${abbrLine}"`
    );
  }

  const [styleAbbr, propValue] = separateStyleAndProperties(abbrLineNoBang);
  if (!styleAbbr) {
    return;
  }

  if (styleAbbr in abbrMap && styleAbbr in globalDefineMap) {
    throw new Error(
      `[CSS-CTRL-ERR] "${styleAbbr}" is defined in both abbrMap and theme.define(...) - name collision not allowed.`
    );
  }

  if (styleAbbr.startsWith('--&')) {
    // ประกาศ local var
    if (isConstContext) {
      throw new Error(
        `[CSS-CTRL-ERR] Local var "${styleAbbr}" not allowed inside @const/theme.define block.`
      );
    }
    // (แก้ตรงนี้) ถ้า isQueryBlock == true => ห้ามประกาศ local var ใน @query
    if (isQueryBlock) {
      throw new Error(
        `[CSS-CTRL-ERR] local var "${styleAbbr}" not allowed to declare in @query block. (abbrLine=${abbrLine})`
      );
    }
    if (isImportant) {
      throw new Error(`[CSS-CTRL-ERR] !important is not allowed with local var "${styleAbbr}".`);
    }

    const localVarName = styleAbbr.slice(3);
    if (!localVarName) {
      throw new Error(
        `[CSS-CTRL-ERR] Missing local var name after "--&". Usage: "--&<name>[value]" (abbrLine=${abbrLine})`
      );
    }

    if (!styleDef.localVars) {
      styleDef.localVars = {};
    }
    if (styleDef.localVars[localVarName] != null) {
      throw new Error(
        `[CSS-CTRL-ERR] local var "${localVarName}" is already declared in this class.`
      );
    }
    styleDef.localVars[localVarName] = convertCSSVariable(propValue);
    return;
  }

  const isVariable = styleAbbr.startsWith('$');
  if (isVariable) {
    // ถ้าอยู่ใน @query block => ห้าม
    if (isQueryBlock) {
      throw new Error(
        `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${abbrLine}"`
      );
    }
    const realAbbr = styleAbbr.slice(1);
    if (realAbbr === 'ty') {
      throw new Error(
        `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
      );
    }
    const expansions = [`${realAbbr}[${propValue}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      if (val2.includes('--&')) {
        throw new Error(
          `[CSS-CTRL-ERR] $variable is not allowed to reference local var (--&xxx). Found: "${abbrLine}"`
        );
      }

      const cssProp = abbrMap[abbr2 as keyof typeof abbrMap];
      if (!cssProp) {
        throw new Error(
          `[CSS-CTRL-ERR] "${abbr2}" not defined in style abbreviation. (abbrLine=${abbrLine})`
        );
      }
      const finalVal = convertCSSVariable(val2);

      if (!styleDef.varBase) {
        styleDef.varBase = {};
      }
      styleDef.varBase[realAbbr] = finalVal;

      styleDef.base[cssProp] = `var(--${realAbbr})${isImportant ? ' !important' : ''}`;
    }
    return;
  }

  if (styleAbbr === 'ty') {
    // ใช้ typography
    const typKey = propValue.trim();
    if (!globalTypographyDict[typKey]) {
      throw new Error(
        `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (abbrLine=${abbrLine})`
      );
    }
    const tokens = globalTypographyDict[typKey].split(/\s+/);
    for (const tk of tokens) {
      parseSingleAbbr(tk, styleDef, false, isQueryBlock, false);
    }
    return;
  }

  if (!(styleAbbr in abbrMap)) {
    // อาจเป็น define
    if (styleAbbr in globalDefineMap) {
      const tokens = propValue.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        throw new Error(
          `[CSS-CTRL-ERR] Multiple subKey not allowed. Found: "${styleAbbr}[${propValue}]"`
        );
      }
      const subK = tokens[0];
      if (!subK) {
        throw new Error(`[CSS-CTRL-ERR] Missing subKey for "${styleAbbr}[...]"`);
      }
      const partialDef = globalDefineMap[styleAbbr][subK];
      if (!partialDef) {
        throw new Error(`[CSS-CTRL-ERR] "${styleAbbr}[${subK}]" not found in theme.define(...).`);
      }
      mergeStyleDef(styleDef, partialDef);
      return;
    }
    throw new Error(
      `"${styleAbbr}" not defined in style abbreviation or theme.define(...) (abbrLine=${abbrLine})`
    );
  }

  // ถ้าอยู่ใน abbrMap
  const expansions = [`${styleAbbr}[${propValue}]`];
  for (const ex of expansions) {
    const [abbr2, val2] = separateStyleAndProperties(ex);
    if (!abbr2) continue;

    const cssProp = abbrMap[abbr2 as keyof typeof abbrMap];
    if (!cssProp) {
      throw new Error(
        `[CSS-CTRL-ERR] "${abbr2}" not defined in style abbreviation. (abbrLine=${abbrLine})`
      );
    }

    let finalVal = convertCSSVariable(val2);
    if (val2.includes('--&')) {
      if (!(styleDef as any)._usedLocalVars) {
        (styleDef as any)._usedLocalVars = new Set<string>();
      }
      // ดึงชื่อ localVar ใน val2
      finalVal = val2.replace(/--&([\w-]+)/g, (_, varName) => {
        (styleDef as any)._usedLocalVars.add(varName);
        return `LOCALVAR(${varName})`;
      });
      styleDef.base[cssProp] = finalVal + (isImportant ? ' !important' : '');
    } else {
      styleDef.base[cssProp] = finalVal + (isImportant ? ' !important' : '');
    }
  }
}
