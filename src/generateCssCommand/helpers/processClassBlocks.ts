// src/generateCssCommand/helpers/processClassBlocks.ts

import { parseSingleAbbr } from '../parsers/parseSingleAbbr';
import { IClassBlock, IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { createEmptyStyleDef } from './createEmptyStyleDef';

import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';

// (ใหม่) import ฟังก์ชัน transformVariables & transformLocalVariables
import { transFormVariables } from '../transformers/transformVariables';
import { transformLocalVariables } from '../transformers/transformLocalVariables';

// (ถ้าเคยมี scope hash)
import { makeFinalName } from '../utils/sharedScopeUtils'; // หรือแก้ path ตามจริง

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

    // copy localVars จาก parent (ให้ลูกอ่านได้)
    if (parentDef.localVars) {
      subDef.localVars = { ...parentDef.localVars };
    }

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

    // merge const
    for (const cName of usedConstNames) {
      if (!constMap.has(cName)) {
        throw new Error(`[SWD-ERR] @use unknown const "${cName}" in nested @query.`);
      }
      const partialDef = constMap.get(cName)!;
      mergeStyleDef(subDef, partialDef);
    }

    // parse normal lines => parseSingleAbbr
    for (const ln of normalLines) {
      parseSingleAbbr(ln, subDef);
    }

    // children -> recursive
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
 * processClassBlocks - parse แต่ละคลาส => สร้าง styleDef => ใส่ลง map
 */
export function processClassBlocks(
  scopeName: string,
  classBlocks: IClassBlock[],
  constMap: Map<string, IStyleDefinition>
): Map<string, IStyleDefinition> {
  const localClasses = new Set<string>();
  const result = new Map<string, IStyleDefinition>();

  for (const block of classBlocks) {
    const clsName = block.className;
    if (localClasses.has(clsName)) {
      throw new Error(
        `[SWD-ERR] Duplicate class ".${clsName}" in scope "${scopeName}" (same file).`
      );
    }
    localClasses.add(clsName);

    const classStyleDef = createEmptyStyleDef();

    // 1) parse nested queries
    const { lines, queries } = parseNestedQueryBlocks(block.body);

    // 2) แยก @use กับ line ปกติ
    let usedConstNames: string[] = [];
    const normalLines: string[] = [];
    for (const ln of lines) {
      if (ln.startsWith('@use ')) {
        usedConstNames.push(...ln.replace('@use', '').trim().split(/\s+/));
      } else {
        normalLines.push(ln);
      }
    }

    // 3) mergeConst ถ้ามี
    for (const cName of usedConstNames) {
      if (!constMap.has(cName)) {
        throw new Error(`[SWD-ERR] @use refers to unknown const "${cName}".`);
      }
      const partialDef = constMap.get(cName)!;
      mergeStyleDef(classStyleDef, partialDef);
    }

    // 4) parse normal lines => parseSingleAbbr
    for (const ln of normalLines) {
      parseSingleAbbr(ln, classStyleDef);
    }

    // 5) parse nested queries => ใส่ใน styleDef.nestedQueries
    classStyleDef.nestedQueries = parseNestedQueryDef(queries, classStyleDef, constMap);

    // 6) ตรวจว่าใช้ local var ก่อนประกาศหรือไม่ (เหมือนเดิม)
    if ((classStyleDef as any)._usedLocalVars) {
      for (const usedVar of (classStyleDef as any)._usedLocalVars) {
        if (!classStyleDef.localVars || !(usedVar in classStyleDef.localVars)) {
          throw new Error(
            `[SWD-ERR] local var "${usedVar}" is used but not declared in ".${clsName}" (scope="${scopeName}").`
          );
        }
      }
    }

    // 7) ทำชื่อ finalKey (กรณีถ้าอยาก hash)
    const finalKey = makeFinalName(scopeName, clsName, block.body);
    // หรือถ้าไม่ใช้ hash => const finalKey = clsName;

    // *** (สำคัญ) transform variable ให้ครบ (parent + child) ***
    transFormVariables(classStyleDef, scopeName, clsName);
    transformLocalVariables(classStyleDef, scopeName, clsName);
    transformNestedQueriesRec(classStyleDef, scopeName, clsName);

    // เก็บลง map
    result.set(finalKey, classStyleDef);
  }

  return result;
}

/**
 * transformNestedQueriesRec - เดินลงไป transform styleDef ลูกทุกชั้น
 */
function transformNestedQueriesRec(def: IStyleDefinition, scopeName: string, className: string) {
  if (!def.nestedQueries) return;
  for (const node of def.nestedQueries) {
    // @ts-ignore
    const childDef = node.styleDef;
    // transform
    transFormVariables(childDef, scopeName, className);
    transformLocalVariables(childDef, scopeName, className);
    // แล้วลงลึก child
    transformNestedQueriesRec(childDef, scopeName, className);
  }
}
