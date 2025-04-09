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

    const rawSelector = body.slice(startSelectorIdx, braceOpenIdx).trim();
    if (!rawSelector) {
      // กรณี @query ตามด้วย { ... } แต่ไม่มี selector
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing selector after @query.');
    }

    // (NEW) เช็คกรณี "@query @scope { ... }" แต่ไม่มี .className ต่อท้าย
    if (rawSelector.startsWith('@scope') && !rawSelector.startsWith('@scope.')) {
      // เช่น "@query @scope { ... }" ไม่มีชื่อต่อท้าย
      throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing selector after @query.');
    }

    let nodeSelector = rawSelector;
    if (nodeSelector.startsWith('@scope.')) {
      const sub = nodeSelector.slice('@scope.'.length).trim();
      if (!sub) {
        // เช่น "@query @scope."
        throw new Error('[CSS-CTRL] parseNestedQueryBlocks: missing className after @scope.');
      }
      // เก็บเป็น placeholder => "SCOPE_REF(...)"
      nodeSelector = `SCOPE_REF(${sub})`;
    }

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

    // parse recursive ข้างใน
    const childResult = parseNestedQueryBlocks(innerBody);

    queries.push({
      selector: nodeSelector,
      rawLines: childResult.lines,
      children: childResult.queries,
    });

    i = j + 1; // move after '}'
  }

  return { lines, queries };
}
