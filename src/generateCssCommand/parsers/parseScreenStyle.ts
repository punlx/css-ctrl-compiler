// src/generateCssCommand/parsers/parseScreenStyle.ts

import { abbrMap } from '../constants/abbrMap';
import { globalBreakpointDict, globalTypographyDict } from '../../extension';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';

export function parseScreenStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false
) {
  const openParenIdx = abbrLine.indexOf('(');
  let inside = abbrLine.slice(openParenIdx + 1, -1).trim();

  const commaIdx = inside.indexOf(',');
  if (commaIdx === -1) {
    throw new Error(`[CSS-CTRL-ERR] "screen" syntax error: ${abbrLine}`);
  }

  let screenPart = inside.slice(0, commaIdx).trim();
  const propsPart = inside.slice(commaIdx + 1).trim();

  if (!(screenPart.startsWith('min') || screenPart.startsWith('max'))) {
    if (globalBreakpointDict[screenPart]) {
      screenPart = globalBreakpointDict[screenPart];
    } else {
      throw new Error(
        `[CSS-CTRL-ERR] unknown breakpoint key "${screenPart}" not found in theme.breakpoint(...)`
      );
    }
  }

  const bracketOpen = screenPart.indexOf('[');
  const bracketClose = screenPart.indexOf(']');
  if (bracketOpen === -1 || bracketClose === -1) {
    throw new Error(
      `[CSS-CTRL-ERR] "screen" must contain something like min-w[600px]. Got ${screenPart}`
    );
  }

  const screenAbbr = screenPart.slice(0, bracketOpen).trim();
  const screenValue = screenPart.slice(bracketOpen + 1, bracketClose).trim();
  const screenProp = abbrMap[screenAbbr as keyof typeof abbrMap];
  if (!screenProp) {
    throw new Error(`[CSS-CTRL-ERR] "${screenAbbr}" not found in abbrMap or not min-w/max-w`);
  }

  const mediaQuery = `(${screenProp}:${screenValue})`;
  const styleList = propsPart.split(/ (?=[^\[\]]*(?:\[|$))/);
  const screenProps: Record<string, string> = {};

  for (const p of styleList) {
    const { line: tokenNoBang, isImportant } = detectImportantSuffix(p);
    if (isConstContext && isImportant) {
      throw new Error(
        `[CSS-CTRL-ERR] !important is not allowed in @const block. Found: "${abbrLine}"`
      );
    }

    const [abbr, val] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;
    const isVar = abbr.startsWith('$');

    // ถ้า isQueryBlock && isVar => throw
    if (isQueryBlock && isVar) {
      throw new Error(
        `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${abbrLine}"`
      );
    }

    if (isVar) {
      throw new Error(`[CSS-CTRL-ERR] $variable cannot use in screen. Found: "${abbrLine}"`);
    }

    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      if (abbr2 === 'ty') {
        const typKey = val2.trim();
        if (!globalTypographyDict[typKey]) {
          throw new Error(
            `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (screen).`
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
              `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (screen) for ty[${typKey}].`
            );
          }
          const finalVal = convertCSSVariable(subVal);
          screenProps[cProp] = finalVal + (tkImp ? ' !important' : '');
        }
        continue;
      }

      const cProp = abbrMap[abbr2 as keyof typeof abbrMap];
      if (!cProp) {
        throw new Error(`[CSS-CTRL-ERR] "${abbr2}" not found in abbrMap (screen).`);
      }
      if (val2.includes('--&')) {
        const replaced = val2.replace(/--&([\w-]+)/g, (_, varName) => {
          return `LOCALVAR(${varName})`;
        });
        screenProps[cProp] = replaced + (isImportant ? ' !important' : '');
      } else {
        screenProps[cProp] = convertCSSVariable(val2) + (isImportant ? ' !important' : '');
      }
    }
  }

  styleDef.screens.push({ query: mediaQuery, props: screenProps });
}
