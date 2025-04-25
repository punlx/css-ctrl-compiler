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
        braceCount = 0; // กันกรณี } เกิน
      }
    }

    // เช็คเฉพาะ top-level (braceCount === 0) และเจอ '>'
    if (braceCount === 0 && c === '>') {
      // นับว่ามี '>' ติดกันกี่ตัว
      let countGT = 1;
      let j = i + 1;
      while (j < body.length && body[j] === '>') {
        countGT++;
        j++;
      }

      // ข้าม '>' เหล่านั้นใน source
      i += countGT;

      // เขียน "@query" ลงใน out
      out += '@query';

      // ถ้าพบว่ามี '>' มากกว่า 1 ตัว => ใส่ space แล้วตามด้วย '>' ที่เหลือ (countGT - 1)
      // เช่น ">> div" => แทนเป็น "@query > div"
      if (countGT > 1) {
        out += ' ' + '>'.repeat(countGT - 1);
      } else {
        out += ' ';
      }
      continue;
    }

    // กรณีทั่วไป
    out += c;
    i++;
  }

  return out;
}

/**
 * parseNestedQueryBlocks
 *  - สแกนหา @query <selector> { ... } (หรือ nested @query ซ้อน ๆ)
 *  - เก็บเนื้อหาที่ไม่ใช่ @query block ไว้ใน lines[]
 *  - เก็บโหนด @query ไว้ใน queries[]
 */
export function parseNestedQueryBlocks(body: string): IParsedNestedQueriesResult {
  // เรียกฟังก์ชัน Pre-process เพื่อแปลง '>' => '@query' ก่อน
  body = transformAngleBracketsToQuery(body);

  const lines: string[] = [];
  const queries: INestedQueryNode[] = [];

  let i = 0;
  while (i < body.length) {
    const queryIdx = body.indexOf('@query', i);
    if (queryIdx === -1) {
      // ไม่มี @query อีก
      const leftover = body.slice(i).trim();
      if (leftover) {
        lines.push(
          ...leftover
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        );
      }
      break;
    }

    // เก็บส่วนก่อนหน้า (ที่ไม่ใช่ @query) ลง lines[]
    const chunkBefore = body.slice(i, queryIdx).trim();
    if (chunkBefore) {
      lines.push(
        ...chunkBefore
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      );
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

    // (A) ตรวจจับเคส "@scope" เปล่าๆ
    if (/@scope(\s|$|\{)/.test(rawSelector)) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing className after "@scope."');
    }

    // (B) replace "@scope.xxx" => SCOPE_REF(xxx)
    rawSelector = rawSelector.replace(/@scope\.([\w-]+)/g, (_m, className) => {
      if (!className) {
        throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing className after @scope.');
      }
      return `SCOPE_REF(${className})`;
    });

    // (NEW) แปลง selector รูปแบบ :option-active / &:option-active => .listboxPlugin-active ฯลฯ
    rawSelector = maybeTransformPluginQuerySelector(rawSelector);

    // นับหาจุดจบของบล็อก { ... }
    let braceCount = 1;
    let j = braceOpenIdx + 1;
    for (; j < body.length; j++) {
      if (body[j] === '{') {
        braceCount++;
      } else if (body[j] === '}') {
        braceCount--;
      }
      if (braceCount === 0) {
        break;
      }
    }
    if (braceCount !== 0) {
      throw new Error('[CSS-CTRL-ERR] parseNestedQueryBlocks: missing closing "}".');
    }

    // innerBody = เนื้อหาภายใน { ... }
    const innerBody = body.slice(braceOpenIdx + 1, j).trim();

    // parse child query (recursive)
    const childResult = parseNestedQueryBlocks(innerBody);

    // @ts-ignore
    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      children: childResult.queries,
    });

    i = j + 1; // ขยับ index ต่อหลัง '}'
  }

  return { lines, queries };
}

/**
 * ถ้ามีเคส :option-active / &:option-active => ให้แปลงเป็น class pluginStatesConfig
 * เช่น :option-active => ' .listboxPlugin-active'
 */
function maybeTransformPluginQuerySelector(rawSelector: string): string {
  const trimmed = rawSelector.trim();

  // ตรวจจับเคส :xxx-yyy หรือ &:xxx-yyy
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
          // case ":..."
          if (pluginCls.startsWith('[')) {
            return ` ${pluginCls}`;
          } else {
            return ` .${pluginCls.replace(/^\./, '')}`;
          }
        } else {
          // case "&:..."
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
