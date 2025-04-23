// src/generateCssCommand/utils/parseNestedQueryBlocks.ts

import { INestedQueryNode } from '../types';
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

interface IParsedNestedQueriesResult {
  lines: string[];
  queries: INestedQueryNode[];
}

export function parseNestedQueryBlocks(body: string): IParsedNestedQueriesResult {
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

    // เก็บส่วนก่อนหน้าเป็น lines
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
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing "{" after @query.');
    }

    let rawSelector = body.slice(startSelectorIdx, braceOpenIdx).trim();
    if (!rawSelector) {
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing selector after @query.');
    }

    // (A) ตรวจจับเคส "@scope" เปล่าๆ หรือ "@scope " (ไม่มีจุด)
    if (/@scope(\s|$|\{)/.test(rawSelector)) {
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing className after "@scope."');
    }

    // (B) replace ทุกตำแหน่งที่เป็น "@scope.<class>" => SCOPE_REF(<class>)
    rawSelector = rawSelector.replace(/@scope\.([\w-]+)/g, (_m, className) => {
      if (!className) {
        throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing className after @scope.');
      }
      return `SCOPE_REF(${className})`;
    });

    // (NEW) แปลง selector รูปแบบ :option-active / &:option-active => ให้มี ".listboxPlugin-active..."
    rawSelector = maybeTransformPluginQuerySelector(rawSelector);

    let braceCount = 1;
    let j = braceOpenIdx + 1;
    for (; j < body.length; j++) {
      if (body[j] === '{') braceCount++;
      else if (body[j] === '}') braceCount--;
      if (braceCount === 0) break;
    }
    if (braceCount !== 0) {
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing closing "}".');
    }

    const innerBody = body.slice(braceOpenIdx + 1, j).trim();
    const childResult = parseNestedQueryBlocks(innerBody);

    // @ts-ignore
    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      children: childResult.queries,
    });

    i = j + 1; // move after '}'
  }

  return { lines, queries };
}

/**
 * maybeTransformPluginQuerySelector
 * - ตรวจ selector ถ้าเป็นรูปแบบ ":option-active" => " .listboxPlugin-active[...]"
 *   หรือ "&:option-active" => "&.listboxPlugin-active[...]"
 */
function maybeTransformPluginQuerySelector(rawSelector: string): string {
  const trimmed = rawSelector.trim();

  // check กรณี :xxx-xxx, &:xxx-xxx
  // เช่น :option-active / &:option-active
  // ขั้นตอน:
  // 1) แยกว่าขึ้นต้นด้วย ":" (ไม่มี &) หรือ "&:" (มี &)
  // 2) แยก pluginPrefix, suffix
  // 3) lookup pluginStatesConfig => ได้ classAttr (e.g. "listboxPlugin-active[aria-selected='true']")
  // 4) ถ้าเป็น ":" => return " .xxx"
  //    ถ้าเป็น "&:" => return "&.xxx"

  if (trimmed.startsWith(':') || trimmed.startsWith('&:')) {
    const useDescendant = trimmed.startsWith(':'); // true => ไม่มี &, => ใส่ space
    let namePart = '';

    if (useDescendant) {
      // e.g. :option-active => slice(1) => "option-active"
      namePart = trimmed.slice(1);
    } else {
      // e.g. &:option-active => slice(2) => "option-active"
      namePart = trimmed.slice(2);
    }

    // split ด้วย "-"
    const dashPos = namePart.indexOf('-');
    if (dashPos > 0) {
      const prefix = namePart.slice(0, dashPos);
      const suffix = namePart.slice(dashPos + 1);
      if (pluginStatesConfig[prefix] && pluginStatesConfig[prefix][suffix]) {
        const pluginCls = pluginStatesConfig[prefix][suffix];
        // e.g. "listboxPlugin-active" or "accordionPlugin-expanded[aria-expanded='true']"

        // (NEW) check มี '['...']' หรือไม่ ถ้ามี => "listboxPlugin-active[aria-selected='true']"
        // สร้างรูปแบบ => useDescendant => " .listboxPlugin-active[aria-selected='true']"
        //            => !useDescendant => "&.listboxPlugin-active[aria-selected='true']"
        if (useDescendant) {
          // => " .xxx"
          return ` .${pluginCls.replace(/^\./, '')}`;
        } else {
          // => "&.xxx"
          // ถ้าปลายทาง pluginCls เริ่มด้วยจุดก็ลบก่อน
          const stripped = pluginCls.replace(/^\./, '');
          return `&.${stripped}`;
        }
      }
    }
  }

  return trimmed;
}
