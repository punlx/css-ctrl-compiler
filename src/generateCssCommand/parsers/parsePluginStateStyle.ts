// src/generateCssCommand/parsers/parsePluginStateStyle.ts

import { pluginStatesConfig } from '../constants/pluginStatesConfig';
import { IStyleDefinition } from '../types';
import { abbrMap } from '../constants/abbrMap';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { globalTypographyDict } from '../../extension';

/**
 * parsePluginStateStyle - parse abbreviation ที่เป็น "<pluginPrefix>-<suffix>( ... )"
 * เช่น "option-active(bg[red] $p[10px] c[--&color])", "accordion-disabled(...)"
 * - ถ้าเจอ "$var" => ใส่ styleDef.varStates["option-active"][varName]
 * - ถ้าเจอ "--&xxx" => แทนเป็น "LOCALVAR(xxx)" แล้วค่อยให้ transformLocalVariables(...) ทำงาน
 * - ถ้ามีทั้ง "$var" และ "--&xxx" ใน property เดียวกัน => throw error
 * - เก็บ prop ปกติใน pluginStates[stateName].props => buildCssText => .app_box.listboxPlugin-active { ... }
 */
export function parsePluginStateStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  keyframeNameMap?: Map<string, string>
): void {
  const openParenIdx = abbrLine.indexOf('(');
  if (openParenIdx === -1) {
    throw new Error(`[CSS-CTRL] parsePluginStateStyle: missing "(" => "${abbrLine}"`);
  }
  const closeParenIdx = abbrLine.lastIndexOf(')');
  if (closeParenIdx === -1) {
    throw new Error(`[CSS-CTRL] parsePluginStateStyle: missing ")" => "${abbrLine}"`);
  }

  const funcName = abbrLine.slice(0, openParenIdx).trim();
  const bracketContent = abbrLine.slice(openParenIdx + 1, closeParenIdx).trim();

  const dashPos = funcName.indexOf('-');
  if (dashPos < 0) {
    throw new Error(`[CSS-CTRL] parsePluginStateStyle: "${funcName}" has no "-" ?`);
  }
  const pluginPrefix = funcName.slice(0, dashPos);
  const pluginSuffix = funcName.slice(dashPos + 1);

  if (!pluginStatesConfig[pluginPrefix]) {
    throw new Error(`[CSS-CTRL] plugin prefix "${pluginPrefix}" not found in pluginStatesConfig.`);
  }
  if (!pluginStatesConfig[pluginPrefix][pluginSuffix]) {
    throw new Error(
      `[CSS-CTRL] plugin suffix "${pluginSuffix}" not found in pluginStatesConfig["${pluginPrefix}"].`
    );
  }
  const pluginClassAttr = pluginStatesConfig[pluginPrefix][pluginSuffix];

  const resultProps: Record<string, string> = {};

  styleDef.varStates = styleDef.varStates || {};
  const stateName = `${pluginPrefix}-${pluginSuffix}`;
  styleDef.varStates[stateName] = styleDef.varStates[stateName] || {};

  if (!bracketContent) {
    if (!(styleDef as any).pluginStates) {
      (styleDef as any).pluginStates = {};
    }
    (styleDef as any).pluginStates[stateName] = {
      classAttr: pluginClassAttr,
      props: resultProps,
    };
    return;
  }

  const tokens = bracketContent.split(/ (?=[^\[\]]*(?:\[|$))/);

  for (const tk of tokens) {
    const { line: tokenNoBang, isImportant } = detectImportantSuffix(tk);
    if (isConstContext && isImportant) {
      throw new Error(`[CSS-CTRL-ERR] !important not allowed in @const. Found: "${tk}"`);
    }

    const [abbr, val] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;

    if (isQueryBlock && abbr.startsWith('$')) {
      throw new Error(`[CSS-CTRL-ERR] $variable not allowed in @query. Found: "${tk}"`);
    }

    // เคส typography
    if (abbr === 'ty') {
      const typKey = val.trim();
      if (!globalTypographyDict[typKey]) {
        throw new Error(
          `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (pluginState).`
        );
      }
      const styleStr = globalTypographyDict[typKey];
      const subTokens = styleStr.split(/\s+/);
      for (const subT of subTokens) {
        const { line: subNoBang, isImportant: subImp } = detectImportantSuffix(subT);
        const [subAbbr, subVal] = separateStyleAndProperties(subNoBang);
        if (!subAbbr) continue;
        const def2 = abbrMap[subAbbr as keyof typeof abbrMap];
        if (!def2) {
          throw new Error(
            `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (ty[${typKey}]) (pluginState).`
          );
        }
        let finalVal2 = subVal + (subImp ? ' !important' : '');
        if (Array.isArray(def2)) {
          for (const prop2 of def2) {
            resultProps[prop2] = finalVal2;
          }
        } else {
          resultProps[def2] = finalVal2;
        }
      }
      continue;
    }

    // เช็คว่ามีทั้ง $... และ --&... ใน val ไหม => ถ้ามีก็ throw
    // เช่น "$c[--&color]" => abbr="$c", val="--&color"
    // แต่บางกรณีอาจเป็น abbr="c", val="$bg --&color"
    // => ควรเช็คทั้ง abbr + val รึเปล่า? เอาเป็นเช็คใน val ตรงๆ ถ้ามี $ และ --& พร้อมกัน => throw
    if (
      (abbr.startsWith('$') || abbr.includes('--&')) &&
      val.includes('--&') &&
      val.includes('$')
    ) {
      // แต่อาจไม่ตรงตาม DSL หรือ parsing
      // ง่ายสุด: ถ้า abbr.startsWith('$') และ val.includes('--&') => throw
      throw new Error(`[CSS-CTRL-ERR] Cannot mix $var and --&var in one property. Found: "${tk}"`);
    }

    let isVar = false;
    let realAbbr = abbr;
    if (abbr.startsWith('$')) {
      isVar = true;
      realAbbr = abbr.slice(1);
    }

    if (isVar) {
      // ex. "$bg[red]"
      if (val.includes('--&')) {
        // ถ้าต้องการให้เจอใน val => throw
        throw new Error(
          `[CSS-CTRL-ERR] Cannot mix $var and --&var in one property. Found: "${tk}"`
        );
      }
      const expansions = [`${realAbbr}[${val}]`];
      for (const ex of expansions) {
        const [abbr2, val2] = separateStyleAndProperties(ex);
        if (!abbr2) continue;
        const def2 = abbrMap[abbr2 as keyof typeof abbrMap];
        if (!def2) {
          throw new Error(`[CSS-CTRL] pluginState: "$${abbr2}" not found in abbrMap.`);
        }
        const finalVal = val2 + (isImportant ? ' !important' : '');
        styleDef.varStates[stateName][abbr2] = finalVal;
        if (Array.isArray(def2)) {
          for (const propName of def2) {
            resultProps[propName] = `var(--${abbr2}-${stateName})`;
          }
        } else {
          resultProps[def2] = `var(--${abbr2}-${stateName})`;
        }
      }
      continue;
    }

    // (B) expansions
    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2Raw] = separateStyleAndProperties(ex);
      if (!abbr2) continue;
      const def2 = abbrMap[abbr2 as keyof typeof abbrMap];
      if (!def2) {
        throw new Error(`[CSS-CTRL] pluginState: abbr "${abbr2}" not found in abbrMap.`);
      }

      // เช็คถ้า val2Raw มี $... และ --&...
      if (val2Raw.includes('$') && val2Raw.includes('--&')) {
        throw new Error(
          `[CSS-CTRL-ERR] Cannot mix $var and --&var in one property. Found: "${tk}"`
        );
      }

      let val2 = val2Raw;
      if (val2.includes('--&')) {
        val2 = val2.replace(/--&([\w-]+)/g, (_, vName) => `LOCALVAR(${vName})`);
      }
      let finalVal = val2 + (isImportant ? ' !important' : '');

      if (Array.isArray(def2)) {
        for (const propName of def2) {
          resultProps[propName] = finalVal;
        }
      } else {
        resultProps[def2] = finalVal;
      }
    }
  }

  if (!(styleDef as any).pluginStates) {
    (styleDef as any).pluginStates = {};
  }
  (styleDef as any).pluginStates[stateName] = {
    classAttr: pluginClassAttr,
    props: resultProps,
  };
}
