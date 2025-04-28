// src/generateCssCommand/helpers/processClassBlocks.ts

import { parseSingleAbbr } from '../parsers/parseSingleAbbr';
import { IClassBlock, IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';

import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';
import { transformVariables } from '../transformers/transformVariables';
import { transformLocalVariables } from '../transformers/transformLocalVariables';

import { makeFinalName } from '../utils/sharedScopeUtils';

/**
 * parseNestedQueryDef - ...
 * ...
 */
// @ts-ignore
function parseNestedQueryDef(
  queries: any[],
  parentDef: IStyleDefinition,
  constMap: Map<string, IStyleDefinition>,

  // --- ADDED for Keyframe rename ---
  keyframeNameMap?: Map<string, string>
) {
  const out = [];

  for (const node of queries) {
    const subDef = createEmptyStyleDef();

    // เรียก mergeMultiLineParen กับ node.rawLines
    const mergedLines = mergeMultiLineParen(node.rawLines);

    const usedConstNames: string[] = [];
    const normalLines: string[] = [];

    for (const ln of mergedLines) {
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
      // --- PASS keyframeNameMap => parseSingleAbbr
      parseSingleAbbr(qLn, subDef, false, true, false, keyframeNameMap);
    }

    // recursive children
    // @ts-ignore
    const childrenParsed = parseNestedQueryDef(node.children, subDef, constMap, keyframeNameMap);

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
  constMap: Map<string, IStyleDefinition>,

  // --- ADDED for Keyframe rename ---
  keyframeNameMap?: Map<string, string>
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

    // เพิ่มขั้นตอน mergeMultiLineParen ให้ lines
    const mergedLines = mergeMultiLineParen(lines);

    let usedConstNames: string[] = [];
    const normalLines: string[] = [];

    for (const ln of mergedLines) {
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
      // --- PASS keyframeNameMap => parseSingleAbbr => เพื่อ rename keyframe
      parseSingleAbbr(ln, classStyleDef, false, false, false, keyframeNameMap);
    }

    // parse nested queries (if any)
    classStyleDef.nestedQueries = parseNestedQueryDef(
      queries,
      classStyleDef,
      constMap,
      keyframeNameMap
    );

    if ((classStyleDef as any)._usedLocalVars) {
      for (const usedVar of (classStyleDef as any)._usedLocalVars) {
        if (!classStyleDef.localVars || !(usedVar in classStyleDef.localVars)) {
          throw new Error(
            `[CSS-CTRL-ERR] local var "${usedVar}" is used but not declared in ".${clsName}" (scope="${scopeName}").`
          );
        }
      }
    }

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

/**
 * mergeMultiLineParen
 * ฟังก์ชันสำหรับรวมหลายบรรทัดที่ยังอยู่ในวงเล็บเปิด '(' แต่ยังไม่เจอ ')' ครบ
 * เพื่อรองรับการเขียนแบบหลายบรรทัดใน hover( ... ), screen( ... ) ฯลฯ
 * และ handle error:
 *   (1) ห้ามมีวงเล็บซ้อน (...) ใน (...)
 *   (2) ห้ามมี '>' หรือ '@query' ภายใน (...)
 */
function mergeMultiLineParen(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // สแกนทีละตัวอักษร
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (ch === '(') {
        // ถ้า parenCount > 0 => แสดงว่ากำลังอยู่ใน (...) แล้วเจอ '(' อีก => ซ้อน
        if (parenCount > 0) {
          throw new Error(`[CSS-CTRL-ERR] Nested parentheses not allowed. Found: "${trimmed}"`);
        }
        parenCount++;
      } else if (ch === ')') {
        parenCount--;
      }
    }

    // ถ้า parenCount > 0 => เราอยู่ในวงเล็บ => ห้ามมี '>' หรือ '@query'
    if (parenCount > 0) {
      if (trimmed.includes('>') || trimmed.includes('@query')) {
        throw new Error(
          `[CSS-CTRL-ERR] ">" or "@query" not allowed inside (...). Found: "${trimmed}"`
        );
      }
    }

    if (!buffer) {
      buffer = trimmed;
    } else {
      buffer += ' ' + trimmed;
    }

    // ถ้า parenCount <= 0 => ครบแล้ว => push buffer
    if (parenCount <= 0 && buffer) {
      // ถ้า parenCount < 0 => เจอ ) เกิน
      if (parenCount < 0) {
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. Line: "${trimmed}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
    }
  }

  // ถ้ายังเหลือ buffer ค้างอยู่
  if (buffer) {
    if (parenCount !== 0) {
      // ถ้า parenCount != 0 => เปิดไม่ปิด
      throw new Error('[CSS-CTRL-ERR] Missing closing ")" in parentheses. Or there is a use of ">query" or "pseudo-function" inside which can cause an error.');
    }
    result.push(buffer);
  }

  return result;
}
