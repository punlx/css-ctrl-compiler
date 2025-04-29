// src/generateCssCommand/utils/parseNestedQueryBlocks.ts

import { INestedQueryNode } from '../types';
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

function transformAngleBracketsToQuery(body: string): string {
  let out = '';
  let i = 0;
  let braceCount = 0;

  while (i < body.length) {
    const c = body[i];

    if (c === '{') {
      braceCount++;
    } else if (c === '}') {
      braceCount--;
      if (braceCount < 0) braceCount = 0;
    }

    // top-level
    if (braceCount === 0 && c === '>') {
      let countGT = 1;
      let j = i + 1;
      while (j < body.length && body[j] === '>') {
        countGT++;
        j++;
      }
      i += countGT;
      out += '@query';
      if (countGT > 1) {
        out += ' ' + '>'.repeat(countGT - 1);
      } else {
        out += ' ';
      }
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

function maybeTransformPluginQuerySelector(rawSelector: string): string {
  const trimmed = rawSelector.trim();
  if (trimmed.startsWith(':') || trimmed.startsWith('&:')) {
    let useDescendant = trimmed.startsWith(':');
    let namePart = useDescendant ? trimmed.slice(1) : trimmed.slice(2);
    const dashPos = namePart.indexOf('-');
    if (dashPos > 0) {
      const prefix = namePart.slice(0, dashPos);
      const suffix = namePart.slice(dashPos + 1);
      if (pluginStatesConfig[prefix] && pluginStatesConfig[prefix][suffix]) {
        const pluginCls = pluginStatesConfig[prefix][suffix];
        if (useDescendant) {
          if (pluginCls.startsWith('[')) {
            return ` ${pluginCls}`;
          } else {
            return ` .${pluginCls.replace(/^\./, '')}`;
          }
        } else {
          if (pluginCls.startsWith('[')) {
            return `&${pluginCls}`;
          } else {
            return `&.${pluginCls.replace(/^\./, '')}`;
          }
        }
      }
    }
  }
  return trimmed;
}

/**
 * parseNestedQueryBlocks
 *  - สแกนหา @query <selector> { ... } หรือ transformAngleBracketsToQuery
 *  - เก็บส่วนอื่น ๆ ไว้ใน lines[], เก็บ @query ไว้ใน queries[]
 *
 * (CHANGED) ตรง mergeMultiLineParen -> mergeLineForQueryBlock
 */
export function parseNestedQueryBlocks(body: string): {
  lines: string[];
  queries: INestedQueryNode[];
} {
  // transform '>' => '@query' (เหมือนเดิม)
  body = transformAngleBracketsToQuery(body);

  const lines: string[] = [];
  const queries: INestedQueryNode[] = [];

  let i = 0;
  while (i < body.length) {
    const queryIdx = body.indexOf('@query', i);
    if (queryIdx === -1) {
      const leftover = body.slice(i).trim();
      if (leftover) {
        let leftoverLines = leftover
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

        // (CHANGED) mergeLineForQueryBlock แทน
        leftoverLines = mergeLineForQueryBlock(leftoverLines);
        lines.push(...leftoverLines);
      }
      break;
    }

    // chunkBefore
    const chunkBefore = body.slice(i, queryIdx).trim();
    if (chunkBefore) {
      let chunkLines = chunkBefore
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      chunkLines = mergeLineForQueryBlock(chunkLines);
      lines.push(...chunkLines);
    }

    // parse "@query <selector> { ... }"
    let startSelectorIdx = queryIdx + '@query'.length;
    while (startSelectorIdx < body.length && /\s/.test(body[startSelectorIdx])) {
      startSelectorIdx++;
    }

    const braceOpenIdx = body.indexOf('{', startSelectorIdx);
    if (braceOpenIdx === -1) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing "{" after @query.');
    }

    let rawSelector = body.slice(startSelectorIdx, braceOpenIdx).trim();
    if (!rawSelector) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing selector after @query.');
    }

    // replace @scope.xxx => SCOPE_REF(xxx)
    rawSelector = rawSelector.replace(/@scope\.([\w-]+)/g, (_m, className) => {
      if (!className) {
        throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing className after @scope.');
      }
      return `SCOPE_REF(${className})`;
    });

    // plugin state short transform
    rawSelector = maybeTransformPluginQuerySelector(rawSelector);

    let nested = 1;
    let j = braceOpenIdx + 1;
    for (; j < body.length; j++) {
      if (body[j] === '{') nested++;
      else if (body[j] === '}') nested--;
      if (nested === 0) {
        break;
      }
    }
    if (nested !== 0) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing closing "}".');
    }

    const innerBody = body.slice(braceOpenIdx + 1, j).trim();

    // recursive parse child
    const childResult = parseNestedQueryBlocks(innerBody);

    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      styleDef: undefined as any, // fill later
      children: childResult.queries,
    });

    i = j + 1;
  }

  return { lines, queries };
}

/**
 * transformAngleBracketsToQuery เหมือนเดิม
 */

/**
 * (CHANGED) mergeLineForQueryBlock
 * เวอร์ชันที่ยอมให้มีวงเล็บ CSS function ใน property value
 */
function mergeLineForQueryBlock(lines: string[]): string[] {
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
        if (/\b(rgba|rgb|calc|hsl|url|clamp|var)\($/.test(ahead)) {
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
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. in query block. Line: "${trimmed}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
      inCssFunc = false;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error(`[CSS-CTRL-ERR] Missing closing ")" in query block.`);
    }
    result.push(buffer);
  }

  return result;
}
