// src/generateCssCommand/utils/parseNestedQueryBlocks.ts

import { INestedQueryNode } from '../types';

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

    // (A) ตรวจจับเคส "@scope" เปล่าๆ  หรือ "@scope " (ไม่มีจุด)
    // เช่น  "@query @scope { ... }"
    // ถ้าเจอ => throw error
    if (/@scope(\s|$|\{)/.test(rawSelector)) {
      // regex ข้างบน match: "@scope" ตามด้วย space, จบสตริง, หรือ {
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing className after "@scope."');
    }

    // (B) ใช้ regex แทนทุกตำแหน่งที่เป็น "@scope.<class>"
    rawSelector = rawSelector.replace(
      /@scope\.([\w-]+)/g,
      (_m, className) => {
        if (!className) {
          // กรณี "@scope." แต่ไม่มี className
          throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing className after @scope.');
        }
        return `SCOPE_REF(${className})`;
      }
    );

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

    queries.push({
      selector: rawSelector,
      rawLines: childResult.lines,
      children: childResult.queries,
    });

    i = j + 1; // move after '}'
  }

  return { lines, queries };
}
