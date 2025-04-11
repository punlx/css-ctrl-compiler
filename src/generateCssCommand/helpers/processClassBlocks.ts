// src/generateCssCommand/helpers/processClassBlocks.ts

import { parseSingleAbbr } from '../parsers/parseSingleAbbr';
import { IClassBlock, IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';

import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';

// (REMOVED) import transformVariables & transformLocalVariables
import { transformVariables } from '../transformers/transformVariables';
import { transformLocalVariables } from '../transformers/transformLocalVariables';

// (REMOVED) No more direct transformVariables or transformLocalVariables here
import { makeFinalName } from '../utils/sharedScopeUtils';

/**
 * parseNestedQueryDef - ...
 * ...
 */
// @ts-ignore
function parseNestedQueryDef(
  queries: any[],
  parentDef: IStyleDefinition,
  constMap: Map<string, IStyleDefinition>
) {
  const out = [];
  for (const node of queries) {
    const subDef = createEmptyStyleDef();

    const usedConstNames: string[] = [];
    const normalLines: string[] = [];
    for (const ln of node.rawLines) {
      if (ln.startsWith('@use ')) {
        usedConstNames.push(...ln.replace('@use', '').trim().split(/\s+/));
      } else {
        normalLines.push(ln);
      }
    }

    for (const cName of usedConstNames) {
      if (!constMap.has(cName)) {
        throw new Error(`[CSS-CTRL-ERR] @use unknown const "${cName}" in nested @query.`);
      }
      const partialDef = constMap.get(cName)!;
      if (partialDef.hasRuntimeVar) {
        throw new Error(
          `[CSS-CTRL-ERR] @use "${cName}" has $variable, not allowed inside nested @query block.`
        );
      }
      if (partialDef.localVars) {
        throw new Error(
          `[CSS-CTRL-ERR] @use "${cName}" has localVar, not allowed inside nested @query block.`
        );
      }
      mergeStyleDef(subDef, partialDef);
    }

    for (const qLn of normalLines) {
      parseSingleAbbr(qLn, subDef, false, true, false);
    }

    // recursive children
    // @ts-ignore
    const childrenParsed = parseNestedQueryDef(node.children, subDef, constMap);

    out.push({
      selector: node.selector,
      styleDef: subDef,
      children: childrenParsed,
    });
  }
  return out;
}

/**
 * processClassBlocks - parse .className { ... } => สร้าง styleDef => ใส่ลง map
 * return ทั้ง Map<finalKey, styleDef> และ shortNameToFinal เพื่อรองรับ @scope.xxx
 */
export function processClassBlocks(
  scopeName: string,
  classBlocks: IClassBlock[],
  constMap: Map<string, IStyleDefinition>
): {
  classMap: Map<string, IStyleDefinition>;
  shortNameToFinal: Map<string, string>;
} {
  const localClasses = new Set<string>();
  const classMap = new Map<string, IStyleDefinition>();
  const shortNameToFinal = new Map<string, string>();

  for (const block of classBlocks) {
    const clsName = block.className;

    if (localClasses.has(clsName)) {
      throw new Error(
        `[CSS-CTRL-ERR] Duplicate class ".${clsName}" in scope "${scopeName}" (same file).`
      );
    }
    localClasses.add(clsName);

    const classStyleDef = createEmptyStyleDef();

    const { lines, queries } = parseNestedQueryBlocks(block.body);

    let usedConstNames: string[] = [];
    const normalLines: string[] = [];
    for (const ln of lines) {
      if (ln.startsWith('@use ')) {
        usedConstNames.push(...ln.replace('@use', '').trim().split(/\s+/));
      } else {
        normalLines.push(ln);
      }
    }

    for (const cName of usedConstNames) {
      if (!constMap.has(cName)) {
        throw new Error(`[CSS-CTRL-ERR] @use refers to unknown const "${cName}".`);
      }
      const partialDef = constMap.get(cName)!;
      mergeStyleDef(classStyleDef, partialDef);
    }

    for (const ln of normalLines) {
      parseSingleAbbr(ln, classStyleDef);
    }

    classStyleDef.nestedQueries = parseNestedQueryDef(queries, classStyleDef, constMap);

    if ((classStyleDef as any)._usedLocalVars) {
      for (const usedVar of (classStyleDef as any)._usedLocalVars) {
        if (!classStyleDef.localVars || !(usedVar in classStyleDef.localVars)) {
          throw new Error(
            `[CSS-CTRL-ERR] local var "${usedVar}" is used but not declared in ".${clsName}" (scope="${scopeName}").`
          );
        }
      }
    }

    // (REMOVED) เดิมเคยมี comment "ถ้าใช้ scope=hash => makeFinalName..."

    const finalKey = makeFinalName(scopeName, clsName, block.body);

    transformVariables(classStyleDef, finalKey, scopeName);
    transformLocalVariables(classStyleDef, finalKey, scopeName);

    // (NEW) เก็บ shortName -> finalKey
    shortNameToFinal.set(clsName, finalKey);

    // เก็บลง map: finalKey -> styleDef
    classMap.set(finalKey, classStyleDef);
  }

  return { classMap, shortNameToFinal };
}
