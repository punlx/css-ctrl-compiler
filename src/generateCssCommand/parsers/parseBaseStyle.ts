// src/generateCssCommand/parsers/parseBaseStyle.ts

import { abbrMap } from '../constants/abbrMap';
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

  // ถ้า abbrMap กับ globalDefineMap มีชื่อชนกัน => throw
  if (styleAbbr in abbrMap && styleAbbr in globalDefineMap) {
    throw new Error(
      `[CSS-CTRL-ERR] "${styleAbbr}" is defined in both abbrMap and theme.define(...) - name collision not allowed.`
    );
  }

  // -----------------------------------------------------------------------
  // (A) ประกาศ local var  --&xxx
  // -----------------------------------------------------------------------
  if (styleAbbr.startsWith('--&')) {
    // ประกาศ local var

    // (REMOVED) เดิมเคยมีโค้ด if (isConstContext) throw error. ตอนนี้ยกเลิกเพื่ออนุญาตใน @const
    if (isQueryBlock) {
      throw new Error(
        `[CSS-CTRL-ERR] local var "${styleAbbr}" not allowed to declare in @query block. (line: ${abbrLine})`
      );
    }
    if (isImportant) {
      throw new Error(`[CSS-CTRL-ERR] !important is not allowed with local var "${styleAbbr}".`);
    }

    const localVarName = styleAbbr.slice(3);
    if (!localVarName) {
      throw new Error(
        `[CSS-CTRL-ERR] Missing local var name after "--&". Usage: "--&<name>[value]" (line: ${abbrLine})`
      );
    }

    // เช็คว่าชื่อ var ซ้ำกับ abbrMap key หรือไม่
    if (localVarName in abbrMap) {
      throw new Error(
        `[CSS-CTRL-ERR] local varriable name "--&${localVarName}" conflicts with abbreviation of style "${localVarName}: ${abbrMap[localVarName]}". Please rename.`
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

  // -----------------------------------------------------------------------
  // (A2) (NEW) ประกาศ "plain local var" => --xxx
  // -----------------------------------------------------------------------
  if (styleAbbr.startsWith('--')) {
    // e.g. --color[red]
    // ไม่ rename ใด ๆ => ออกมาเป็น --color: red;
    // สมมุติอนุญาตในทุกบริบท (รวม @query, @const)
    // ถ้าต้องการห้ามใน @const => throw error ได้

    const rawName = styleAbbr.slice(2); // e.g. "color"
    if (!rawName) {
      throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${abbrLine}"`);
    }

    // สร้าง plainLocalVars ถ้ายังไม่มี
    if (!(styleDef as any).plainLocalVars) {
      (styleDef as any).plainLocalVars = {};
    }
    (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(propValue);
    return;
  }

  // -----------------------------------------------------------------------
  // (B) ถ้าเป็น runtime var => $xxx
  // -----------------------------------------------------------------------
  const isVariable = styleAbbr.startsWith('$');
  if (isVariable) {
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

      // ตรวจ lookup abbrMap
      const def = abbrMap[abbr2 as keyof typeof abbrMap];
      if (!def) {
        throw new Error(
          `[CSS-CTRL-ERR] "${abbr2}" not defined in style abbreviation. (line: ${abbrLine})`
        );
      }
      const finalVal = convertCSSVariable(val2);

      // เก็บ varBase => สุดท้าย transformVariables จะสร้าง :root { --mx-box_AbCdE: finalVal }
      if (!styleDef.varBase) {
        styleDef.varBase = {};
      }
      styleDef.varBase[realAbbr] = finalVal;

      // ใส่ base prop => "var(--realAbbr)"
      const varRef = `var(--${realAbbr})${isImportant ? ' !important' : ''}`;

      // (NEW) ถ้า def เป็น array => set หลาย property
      if (Array.isArray(def)) {
        for (const propName of def) {
          styleDef.base[propName] = varRef;
        }
      } else {
        styleDef.base[def] = varRef;
      }
    }
    return;
  }

  // -----------------------------------------------------------------------
  // (C) ถ้าเป็น "ty" => ใช้ typography
  // -----------------------------------------------------------------------
  if (styleAbbr === 'ty') {
    const typKey = propValue.trim();
    if (!globalTypographyDict[typKey]) {
      throw new Error(
        `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (line: ${abbrLine})`
      );
    }
    const tokens = globalTypographyDict[typKey].split(/\s+/);
    for (const tk of tokens) {
      parseSingleAbbr(tk, styleDef, false, isQueryBlock, false);
    }
    return;
  }

  // -----------------------------------------------------------------------
  // (D) ถ้าไม่เจอใน abbrMap => อาจเป็น define?
  // -----------------------------------------------------------------------
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
      `[CSS-CTRL-ERR] "${styleAbbr}" not defined in style abbreviation or theme.define(...) (line: ${abbrLine})`
    );
  }

  // -----------------------------------------------------------------------
  // (E) ถ้าอยู่ใน abbrMap => parse expansions
  // -----------------------------------------------------------------------
  const expansions = [`${styleAbbr}[${propValue}]`];
  for (const ex of expansions) {
    const [abbr2, val2] = separateStyleAndProperties(ex);
    if (!abbr2) continue;

    const def = abbrMap[abbr2 as keyof typeof abbrMap];
    if (!def) {
      throw new Error(
        `[CSS-CTRL-ERR] "${abbr2}" not defined in style abbreviation. (line: ${abbrLine})`
      );
    }

    let finalVal = convertCSSVariable(val2);
    if (val2.includes('--&')) {
      // local var usage
      if (!(styleDef as any)._usedLocalVars) {
        (styleDef as any)._usedLocalVars = new Set<string>();
      }
      finalVal = val2.replace(/--&([\w-]+)/g, (_, varName) => {
        (styleDef as any)._usedLocalVars.add(varName);
        return `LOCALVAR(${varName})`;
      });
      finalVal += isImportant ? ' !important' : '';
    } else {
      finalVal += isImportant ? ' !important' : '';
    }

    // (NEW) ถ้า def เป็น array => set หลาย property
    if (Array.isArray(def)) {
      for (const propName of def) {
        styleDef.base[propName] = finalVal;
      }
    } else {
      styleDef.base[def] = finalVal;
    }
  }
}
