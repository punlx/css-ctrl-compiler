// src/generateCssCommand/utils/parseNestedQueryBlocks.ts

import { INestedQueryNode } from '../types';
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

interface IParsedNestedQueriesResult {
  lines: string[];
  queries: INestedQueryNode[];
}

/**
 * ฟังก์ชันใหม่ (Pre-process):
 * สแกนไฟล์ DSL เพื่อหา '>' ในระดับ top-level แล้วแทนที่ด้วย "@query "
 * - ถ้าพบ ">>" ติดกัน ก็จะแปลงตัวแรกเป็น "@query " และเหลือ '>' ถัดมาไว้ใน selector
 *   ทำให้เช่น `> > div { ... }` กลายเป็น `@query > div { ... }`
 */
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
      if (braceCount < 0) {
        braceCount = 0; // กันกรณี }
      }
    }

    // เช็คเฉพาะ top-level (braceCount === 0) และเจอ '>'
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

/**
 * ถ้ามีเคส :option-active / &:option-active => ให้แปลงเป็น class pluginStatesConfig
 * เช่น :option-active => ' .listboxPlugin-active'
 */
function maybeTransformPluginQuerySelector(rawSelector: string): string {
  const trimmed = rawSelector.trim();

  if (trimmed.startsWith(':') || trimmed.startsWith('&:')) {
    const useDescendant = trimmed.startsWith(':');
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
            const stripped = pluginCls.replace(/^\./, '');
            return `&.${stripped}`;
          }
        }
      }
    }
  }

  return trimmed;
}

/**
 * parseNestedQueryBlocks
 *  - สแกนหา @query <selector> { ... } (หรือ nested @query ซ้อน ๆ)
 *  - เก็บเนื้อหาที่ไม่ใช่ @query block ไว้ใน lines[]
 *  - เก็บโหนด @query ไว้ใน queries[]
 */
export function parseNestedQueryBlocks(body: string): IParsedNestedQueriesResult {
  // เรียกฟังก์ชัน Pre-process เพื่อแปลง '>' => '@query'
  body = transformAngleBracketsToQuery(body);

  const lines: string[] = [];
  const queries: INestedQueryNode[] = [];

  let i = 0;
  while (i < body.length) {
    const queryIdx = body.indexOf('@query', i);
    if (queryIdx === -1) {
      const leftover = body.slice(i).trim();
      if (leftover) {
        // split leftover
        let leftoverLines = leftover
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

        // merge paren line
        leftoverLines = mergeMultiLineParen(leftoverLines);
        lines.push(...leftoverLines);
      }
      break;
    }

    // chunkBefore => ส่วนก่อนหน้า @query
    const chunkBefore = body.slice(i, queryIdx).trim();
    if (chunkBefore) {
      let chunkLines = chunkBefore
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      chunkLines = mergeMultiLineParen(chunkLines);
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

    // replace "@scope.xxx" => SCOPE_REF(xxx)
    rawSelector = rawSelector.replace(/@scope\.([\w-]+)/g, (_m, className) => {
      if (!className) {
        throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing className after @scope.');
      }
      return `SCOPE_REF(${className})`;
    });

    // แปลง :option-active / &:option-active => plugin class
    rawSelector = maybeTransformPluginQuerySelector(rawSelector);

    // นับหาจุดจบของบล็อก { ... }
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

    // parse child query (recursive)
    const childResult = parseNestedQueryBlocks(innerBody);

    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      styleDef: undefined as any, // ไปกำหนดทีหลัง
      children: childResult.queries,
    });

    i = j + 1;
  }

  return { lines, queries };
}

/**
 * mergeMultiLineParen
 * ฟังก์ชันเหมือนใน processClassBlocks แต่เพิ่มการ handle error:
 *   (1) ห้ามมีวงเล็บซ้อน
 *   (2) ห้ามมี '>' หรือ '@query' ภายใน (...)
 */
function mergeMultiLineParen(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // เดินเช็คทีละตัว
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') {
        if (parenCount > 0) {
          throw new Error(`[CSS-CTRL-ERR] Nested parentheses not allowed in: "${trimmed}"`);
        }
        parenCount++;
      } else if (ch === ')') {
        parenCount--;
      }
    }

    // ถ้า parenCount > 0 => อยู่ใน (...), ห้ามมี '>' หรือ '@query'
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

    if (parenCount <= 0 && buffer) {
      if (parenCount < 0) {
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. Line: "${trimmed}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error('[CSS-CTRL-ERR] Missing closing ")" in parentheses.');
    }
    result.push(buffer);
  }

  return result;
}
