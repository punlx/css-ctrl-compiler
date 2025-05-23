// src/generateCssCommand/parsers/parseContainerStyle.ts

import { abbrMap } from '../constants/abbrMap';
import { globalBreakpointDict, globalTypographyDict } from '../../extension';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { IStyleDefinition } from '../types';

// ADDED for theme.property
import { globalDefineMap } from '../createCssCtrlCssCommand';

export function parseContainerStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false
) {
  const openParenIdx = abbrLine.indexOf('(');
  let inside = abbrLine.slice(openParenIdx + 1, -1).trim();
  const commaIdx = inside.indexOf(',');
  if (commaIdx === -1) {
    throw new Error(`[CSS-CTRL-ERR] "container" syntax error: ${abbrLine}`);
  }

  let containerPart = inside.slice(0, commaIdx).trim();
  const propsPart = inside.slice(commaIdx + 1).trim();

  if (!(containerPart.startsWith('min') || containerPart.startsWith('max'))) {
    if (globalBreakpointDict[containerPart]) {
      containerPart = globalBreakpointDict[containerPart];
    } else {
      throw new Error(
        `[CSS-CTRL-ERR] unknown breakpoint key "${containerPart}" not found in theme.breakpoint(...) for container(...)`
      );
    }
  }

  const bracketOpen = containerPart.indexOf('[');
  const bracketClose = containerPart.indexOf(']');
  if (bracketOpen === -1 || bracketClose === -1) {
    throw new Error(
      `[CSS-CTRL-ERR] "container" must contain e.g. min-w[600px]. Got ${containerPart}`
    );
  }

  const cAbbr = containerPart.slice(0, bracketOpen).trim();
  const cValue = containerPart.slice(bracketOpen + 1, bracketClose).trim();
  const cProp = abbrMap[cAbbr as keyof typeof abbrMap];
  if (!cProp) {
    throw new Error(`[CSS-CTRL-ERR] "${cAbbr}" not found in abbrMap for container.`);
  }

  const containerQuery = `(${cProp}:${cValue})`;
  const propsList = propsPart.split(/ (?=[^\[\]]*(?:\[|$))/);

  const containerProps: Record<string, string> = {};

  for (const p of propsList) {
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

    const isVar = abbr.startsWith('$');

    if (isQueryBlock && isVar) {
      throw new Error(
        `[CSS-CTRL-ERR] $variable not allowed inside @query for container. Found: "${abbrLine}"`
      );
    }
    if (isVar) {
      throw new Error(`[CSS-CTRL-ERR] $variable cannot use in container. Found: "${abbrLine}"`);
    }

    const expansions = [`${abbr}[${val}]`];
    for (const ex of expansions) {
      const [abbr2, val2] = separateStyleAndProperties(ex);
      if (!abbr2) continue;

      if (abbr2 === 'ty') {
        const typKey = val2.trim();
        if (!globalTypographyDict[typKey]) {
          throw new Error(
            `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (container).`
          );
        }
        const styleStr = globalTypographyDict[typKey];
        const tokens = styleStr.split(/\s+/);
        for (const tk of tokens) {
          const { line: tkNoBang, isImportant: tkImp } = detectImportantSuffix(tk);
          const [subAbbr, subVal] = separateStyleAndProperties(tkNoBang);
          if (!subAbbr) continue;

          const cProp2 = abbrMap[subAbbr as keyof typeof abbrMap];
          if (!cProp2) {
            throw new Error(
              `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (container). (ty[${typKey}])`
            );
          }
          let finalVal2 = convertCSSVariable(subVal);
          finalVal2 += tkImp ? ' !important' : '';
          if (Array.isArray(cProp2)) {
            for (const pr of cProp2) {
              containerProps[pr] = finalVal2;
            }
          } else {
            containerProps[cProp2] = finalVal2;
          }
        }
        continue;
      }

      // (NEW) plain local var => "--xxx"
      if (abbr2.startsWith('--') && !abbr2.startsWith('--&')) {
        const rawName = abbr2.slice(2);
        if (!rawName) {
          throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${ex}"`);
        }
        if (!(styleDef as any).plainLocalVars) {
          (styleDef as any).plainLocalVars = {};
        }
        (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(val2);
        continue;
      }

      const def = abbrMap[abbr2 as keyof typeof abbrMap];
      if (!def) {
        // ADDED for theme.property fallback
        if (abbr2 in globalDefineMap) {
          const subKey = val2.trim();
          if (!globalDefineMap[abbr2][subKey]) {
            throw new Error(
              `[CSS-CTRL-ERR] "${abbr2}[${subKey}]" not found in theme.property(...) (container).`
            );
          }
          const partialDef = globalDefineMap[abbr2][subKey];
          for (const propName in partialDef.base) {
            containerProps[propName] =
              partialDef.base[propName] + (isImportant ? ' !important' : '');
          }
          continue;
        } else {
          throw new Error(`[CSS-CTRL-ERR] "${abbr2}" not found in abbrMap (container).`);
        }
      }

      let finalVal = convertCSSVariable(val2);
      if (val2.includes('--&')) {
        const replaced = val2.replace(/--&([\w-]+)/g, (_, varName) => {
          return `LOCALVAR(${varName})`;
        });
        finalVal = replaced + (isImportant ? ' !important' : '');
      } else {
        finalVal += isImportant ? ' !important' : '';
      }

      if (Array.isArray(def)) {
        for (const propName of def) {
          containerProps[propName] = finalVal;
        }
      } else {
        containerProps[def] = finalVal;
      }
    }
  }

  styleDef.containers.push({
    query: containerQuery,
    props: containerProps,
  });
}
