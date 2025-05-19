// src/generateCssCommand/utils/parseNestedQueryBlocks.ts

import { INestedQueryNode } from '../types';
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

/**
 * ฟังก์ชันเดิม transformAngleBracketsToQuery (ใช้สำหรับ '>') ถูกปรับปรุงให้รวมการแทนที่ '<' => '@parent'
 * โดย:
 *   - เจอ '>' ระดับ top-level => แทนเป็น '@query '
 *   - เจอ '<' ระดับ top-level => แทนเป็น '@parent '
 */
function transformAngleBrackets(body: string): string {
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

    // เงื่อนไข: ต้องอยู่ top-level (braceCount===0) แล้วเจอ '>' หรือ '<'
    // จากนั้นนับว่ามีกี่ตัวติดกัน
    if (braceCount === 0 && (c === '>' || c === '<')) {
      const symbol = c; // '>' หรือ '<'
      let countSymbol = 1;
      let j = i + 1;
      while (j < body.length && body[j] === symbol) {
        countSymbol++;
        j++;
      }
      i += countSymbol;

      if (symbol === '>') {
        out += '@query';
      } else {
        out += '@parent';
      }

      // ถ้ามีตัวติดกันมากกว่า 1 ตัว => เว้นวรรค + ใส่สัญลักษณ์ต่อ
      // เช่น >> => "@query >"
      // หรือ << => "@parent <"
      if (countSymbol > 1) {
        out += ' ' + symbol.repeat(countSymbol - 1);
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
            return `${pluginCls}`;
          } else {
            return `.${pluginCls.replace(/^\./, '')}`;
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
 *   - ใช้ทั้ง @query และ @parent
 *   - มีพารามิเตอร์เพิ่ม parentBlockDepth เพื่อห้าม nested @parent ภายใน @parent
 */
export function parseNestedQueryBlocks(
  body: string,
  parentBlockDepth = 0 // default 0
): {
  lines: string[];
  queries: INestedQueryNode[];
} {
  // ขั้นแรก transform ทั้ง '>' => '@query' และ '<' => '@parent'
  body = transformAngleBrackets(body);

  const lines: string[] = [];
  const queries: INestedQueryNode[] = [];

  let i = 0;
  while (i < body.length) {
    // หา '@query' หรือ '@parent'
    const regex = /@(query|parent)/g;
    regex.lastIndex = i;
    const match = regex.exec(body);
    if (!match) {
      const leftover = body.slice(i).trim();
      if (leftover) {
        let leftoverLines = leftover
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        leftoverLines = mergeLineForQueryBlock(leftoverLines);
        lines.push(...leftoverLines);
      }
      break;
    }

    // ถ้าเจอ match => แยกเป็น @query หรือ @parent
    const fullMatch = match[0]; // "@query" หรือ "@parent"
    const whichDir = match[1]; // "query" หรือ "parent"
    const idxFound = match.index;

    // chunk ก่อนหน้า => เก็บเป็น lines
    const chunkBefore = body.slice(i, idxFound).trim();
    if (chunkBefore) {
      let chunkLines = chunkBefore
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      chunkLines = mergeLineForQueryBlock(chunkLines);
      lines.push(...chunkLines);
    }

    // ขยับ i => หลัง match
    let startSelectorIdx = idxFound + fullMatch.length;
    while (startSelectorIdx < body.length && /\s/.test(body[startSelectorIdx])) {
      startSelectorIdx++;
    }

    const braceOpenIdx = body.indexOf('{', startSelectorIdx);
    if (braceOpenIdx === -1) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing "{" after @query/@parent.');
    }

    let rawSelector = body.slice(startSelectorIdx, braceOpenIdx).trim();
    if (!rawSelector) {
      throw new Error(
        '[CSS-CTRL-ERR] parseNestedQueryBlocks: missing selector after @query/@parent.'
      );
    }

    // เช็คเคส @parent ซ้อนใน @parent => ถ้า parentBlockDepth > 0 แล้วเจอ @parent อีก => throw
    if (whichDir === 'parent' && parentBlockDepth > 0) {
      throw new Error(
        '[CSS-CTRL-ERR] Nested "<" (i.e. @parent) inside another "<" block is not allowed.'
      );
    }

    // แทนที่ @scope.xxx => SCOPE_REF(xxx)
    rawSelector = rawSelector.replace(/@scope\.([\w-]+)/g, (_m, className) => {
      if (!className) {
        throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing className after @scope.');
      }
      return `SCOPE_REF(${className})`;
    });

    // แปลง plugin syntax (:option-active => .listboxPlugin-active[aria-selected="true"], etc.)
    rawSelector = maybeTransformPluginQuerySelector(rawSelector);

    // อ่าน body ภายใน {...}
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

    // parse children (recursive) => ถ้า whichDir === 'parent' => parentBlockDepth+1
    const childResult = parseNestedQueryBlocks(
      innerBody,
      whichDir === 'parent' ? parentBlockDepth + 1 : parentBlockDepth
    );

    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      styleDef: undefined as any,
      children: childResult.queries,
      // (NEW) ใส่ flag บอกว่าเป็น parentBlock ไหม
      isParentBlock: whichDir === 'parent',
    });

    i = j + 1; // ต่อหลัง '}'
  }

  return { lines, queries };
}

/**
 * (CHANGED) mergeLineForQueryBlock
 * เดิม throw error ถ้าเจอ ';', ตอนนี้เปลี่ยนเป็นลบออกแทน
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
        if (
          /\b(rgba|rgb|calc|hsl|url|clamp|var|min|max|attr|counter|counters|env|repeat|linear-gradient|radial-gradient|conic-gradient|image-set|matrix|translate|translatex|translatey|translatez|translate3d|scale|scalex|scaley|scalez|scale3d|rotate|rotatex|rotatey|rotatez|rotate3d|skew|skewx|skewy|perspective)\($/.test(
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
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. in query block. Line: "${trimmed}"`);
      }

      // ลบ ';'
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
      throw new Error(`[CSS-CTRL-ERR] Missing closing ")" in query block.`);
    }

    if (buffer.includes(';')) {
      buffer = buffer.replace(/;/g, '');
    }
    result.push(buffer);
  }

  return result;
}
