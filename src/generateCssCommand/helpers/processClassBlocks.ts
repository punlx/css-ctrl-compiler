// src/generateCssCommand/helpers/processClassBlocks.ts

import { parseSingleAbbr } from '../parsers/parseSingleAbbr';
import { IClassBlock, IStyleDefinition } from '../types';
import { mergeStyleDef } from '../utils/mergeStyleDef';
import { createEmptyStyleDef } from './createEmptyStyleDef';

import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';
import { transformVariables } from '../transformers/transformVariables';
import { transformLocalVariables } from '../transformers/transformLocalVariables';

import { makeFinalName } from '../utils/sharedScopeUtils';

/**
 * (CHANGED) parseNestedQueryDef:
 *  - handle children queries recursively
 */
// @ts-ignore
function parseNestedQueryDef(
  queries: any[],
  parentDef: IStyleDefinition,
  constMap: Map<string, IStyleDefinition>,
  keyframeNameMap?: Map<string, string>
) {
  const out = [];

  for (const node of queries) {
    const subDef = createEmptyStyleDef();

    const mergedLines = mergeLineForClass(node.rawLines);

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
      parseSingleAbbr(qLn, subDef, false, true, false, keyframeNameMap);
    }

    // recursive children
    // @ts-ignore
    const childrenParsed = parseNestedQueryDef(node.children, subDef, constMap, keyframeNameMap);

    out.push({
      selector: node.selector,
      styleDef: subDef,
      children: childrenParsed,
      // **สำคัญ**: preserve isParentBlock
      isParentBlock: node.isParentBlock,
    });
  }

  return out;
}

/**
 * processClassBlocks
 *  - parse .className { ... } => สร้าง styleDef => ใส่ลง map
 */
export function processClassBlocks(
  scopeName: string,
  classBlocks: IClassBlock[],
  constMap: Map<string, IStyleDefinition>,
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

    // (NEW) เช็คห้ามใช้ชื่อ "var"
    if (clsName === 'var') {
      throw new Error(
        `[CSS-CTRL-ERR] Class name ".var" is not allowed (reserved word for @var directive).`
      );
    }

    if (localClasses.has(clsName)) {
      throw new Error(
        `[CSS-CTRL-ERR] Duplicate class ".${clsName}" in scope "${scopeName}" (same file).`
      );
    }
    localClasses.add(clsName);

    const classStyleDef = createEmptyStyleDef();

    const { lines, queries } = parseNestedQueryBlocks(block.body);

    const mergedLines = mergeLineForClass(lines);

    let usedConstNames: string[] = [];
    const normalLines: string[] = [];

    for (const ln of mergedLines) {
      if (ln.startsWith('@use ')) {
        usedConstNames.push(...ln.replace('@use', '').trim().split(/\s+/));
      } else if (ln.startsWith('@bind ')) {
        if (!(classStyleDef as any)._bindLines) {
          (classStyleDef as any)._bindLines = [];
        }
        (classStyleDef as any)._bindLines.push(ln);
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
      parseSingleAbbr(ln, classStyleDef, false, false, false, keyframeNameMap);
    }

    // (CHANGED) parseNestedQueryDef => ใส่ isParentBlock
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

    shortNameToFinal.set(clsName, finalKey);
    classMap.set(finalKey, classStyleDef);
  }

  return { classMap, shortNameToFinal };
}

/**
 * (CHANGED) mergeLineForClass
 * เดิมเรา throw error ถ้าเจอ ';' -> ตอนนี้เปลี่ยนเป็นลบออก
 */
function mergeLineForClass(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;
  let inCssFunc = false;

  for (const line of lines) {
    const trimmed = line.trim();

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') {
        const ahead = trimmed.slice(Math.max(0, i - 5), i + 1).toLowerCase();
        if (
          /\b(rgba|rgb|calc|hsl|hsla|url|clamp|var|min|max|attr|counter|counters|env|repeat|linear-gradient|radial-gradient|conic-gradient|image-set|matrix|translate|translatex|translatey|translatez|translate3d|scale|scalex|scaley|scalez|scale3d|rotate|rotatex|rotatey|rotatez|rotate3d|skew|skewx|skewy|perspective)\($/.test(
            ahead
          )
        ) {
          inCssFunc = true;
        } else {
          if (parenCount > 0 && !inCssFunc) {
            throw new Error(
              `[CSS-CTRL-ERR] Nested DSL parentheses not allowed. Found: "${trimmed}"`
            );
          }
          parenCount++;
        }
      } else if (ch === ')') {
        if (inCssFunc) {
          inCssFunc = false;
        } else {
          parenCount--;
        }
      }
    }

    if (!buffer) {
      buffer = trimmed;
    } else {
      buffer += ' ' + trimmed;
    }

    if (parenCount <= 0) {
      if (parenCount < 0) {
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found in class block. Line: "${trimmed}"`);
      }

      // ลบ ';' แทน throw error
      if (buffer.includes(';')) {
        buffer = buffer.replace(/;/g, '');
      }

      result.push(buffer);
      buffer = '';
      parenCount = 0;
      inCssFunc = false;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error('[CSS-CTRL-ERR] Missing closing ")" in class block.');
    }
    if (buffer.includes(';')) {
      buffer = buffer.replace(/;/g, '');
    }
    result.push(buffer);
  }

  return result;
}
