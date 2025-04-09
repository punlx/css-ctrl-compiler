import { parseSingleAbbr } from '../parsers/parseSingleAbbr';
import { IClassBlock, IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { createEmptyStyleDef } from './createEmptyStyleDef';

import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';

// (NEW) import transformVariables & transformLocalVariables
import { transformVariables } from '../transformers/transformVariables';
import { transformLocalVariables } from '../transformers/transformLocalVariables';

// (ถ้าใช้ scope=hash => makeFinalName)
import { makeFinalName } from '../utils/sharedScopeUtils';

/**
 * parseNestedQueryDef: เปลี่ยนมาไม่ copy parentDef.localVars -> subDef
 */
// @ts-ignore
function parseNestedQueryDef(
  queries: any[],
  parentDef: IStyleDefinition,
  constMap: Map<string, IStyleDefinition>
) {
  const out = [];
  for (const node of queries) {
    // สร้าง styleDef ลูก
    const subDef = createEmptyStyleDef();

    // แยก @use vs line ปกติ
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
      // ห้าม partialDef.hasRuntimeVar => throw ...
      if (partialDef.hasRuntimeVar) {
        throw new Error(
          `[CSS-CTRL-ERR] @use "${cName}" has $variable, not allowed inside nested @query block.`
        );
      }
      // ถ้ามี localVar => policy ว่ายังไง?
      if (partialDef.localVars) {
        throw new Error(
          `[CSS-CTRL-ERR] @use "${cName}" has localVar, not allowed inside nested @query block.`
        );
      }
      mergeStyleDef(subDef, partialDef);
    }

    // parse normal lines => parseSingleAbbr (isQueryBlock = true)
    for (const qLn of normalLines) {
      parseSingleAbbr(qLn, subDef, false, true /* isQueryBlock */, false);
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
 * (UPDATED)
 * processClassBlocks - parse .className { ... } => สร้าง styleDef => ใส่ลง map
 * *** เพิ่มเติม: return ทั้ง Map<finalKey, styleDef> และ shortNameToFinal เพื่อรองรับ @scope.xxx
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

  // (NEW) เก็บ shortName => finalName
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

    // (A) parse nested queries
    const { lines, queries } = parseNestedQueryBlocks(block.body);

    // (B) แยก @use vs normal line
    let usedConstNames: string[] = [];
    const normalLines: string[] = [];
    for (const ln of lines) {
      if (ln.startsWith('@use ')) {
        usedConstNames.push(...ln.replace('@use', '').trim().split(/\s+/));
      } else {
        normalLines.push(ln);
      }
    }

    // (C) merge const ถ้ามี
    for (const cName of usedConstNames) {
      if (!constMap.has(cName)) {
        throw new Error(`[CSS-CTRL-ERR] @use refers to unknown const "${cName}".`);
      }
      const partialDef = constMap.get(cName)!;
      mergeStyleDef(classStyleDef, partialDef);
    }

    // (D) parse normal lines => parseSingleAbbr
    for (const ln of normalLines) {
      parseSingleAbbr(ln, classStyleDef);
    }

    // (E) parse nested queries => เก็บใน styleDef.nestedQueries
    classStyleDef.nestedQueries = parseNestedQueryDef(queries, classStyleDef, constMap);

    // (F) เช็ค local var
    if ((classStyleDef as any)._usedLocalVars) {
      for (const usedVar of (classStyleDef as any)._usedLocalVars) {
        if (!classStyleDef.localVars || !(usedVar in classStyleDef.localVars)) {
          throw new Error(
            `[CSS-CTRL-ERR] local var "${usedVar}" is used but not declared in ".${clsName}" (scope="${scopeName}").`
          );
        }
      }
    }

    // (G) ทำ finalKey
    const finalKey = makeFinalName(scopeName, clsName, block.body);

    // (NEW) transform variable (parent) แต่ใช้ finalKey แทน clsName
    transformVariables(classStyleDef, finalKey);
    transformLocalVariables(classStyleDef, finalKey);

    // (NEW) เก็บ shortName -> finalKey
    shortNameToFinal.set(clsName, finalKey);

    // เก็บลง map: finalKey -> styleDef
    classMap.set(finalKey, classStyleDef);
  }

  return { classMap, shortNameToFinal };
}
