// src/generateCssCommand/parsers/parseDirectives.ts
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { parseClassBlocksWithBraceCounting } from '../helpers/parseClassBlocksWithBraceCounting';
import { parseSingleAbbr } from './parseSingleAbbr';

import {
  IClassBlock,
  IConstBlock,
  IParsedDirective,
  IParseDirectivesResult,
  IKeyframeBlock,
} from '../types';

/**
 * parseDirectives:
 *  - สแกนไฟล์หาคำสั่ง @const, @keyframe, @scope, @bind ฯลฯ
 *  - ดึง .className { ... } ที่ระดับ top-level
 *  - ส่งผลลัพธ์เป็น IParseDirectivesResult
 */
export function parseDirectives(text: string): IParseDirectivesResult {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];

  // --- ADDED FOR KEYFRAME ---
  const keyframeBlocks: IKeyframeBlock[] = [];

  let newText = text;

  // -----------------------------------------
  // (1) parse @const <name> { ... }
  // -----------------------------------------
  const constRegex = /^[ \t]*@const\s+([\w-]+)\s*\{([\s\S]*?)\}/gm;
  const allConstMatches = [...newText.matchAll(constRegex)];
  for (const m of allConstMatches) {
    const fullMatch = m[0];
    const constName = m[1];
    const rawBlock = m[2]; // เนื้อใน {...}

    // สร้าง styleDef ว่าง
    const partialDef = createEmptyStyleDef();

    // split เป็นบรรทัด
    const splittedLines = rawBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // (NEW) mergeMultiLineParen เพื่อรองรับ hover( ... ) / screen(...) หลายบรรทัด
    const mergedLines = mergeMultiLineParen(splittedLines);

    for (const ln of mergedLines) {
      // ห้ามมี @query ใน @const => parseSingleAbbr(.. isConstContext=true, isQueryBlock=false)
      parseSingleAbbr(ln, partialDef, /*isConstContext=*/ true, /*isQueryBlock=*/ false);
    }

    // เก็บเป็น IConstBlock
    constBlocks.push({ name: constName, styleDef: partialDef });

    // ตัด substring ที่ match ออก (กันไม่ให้ parse ซ้ำ)
    newText = newText.replace(fullMatch, '').trim();
  }

  // -----------------------------------------
  // (2) parse @keyframe <name> { ... }
  // -----------------------------------------
  const keyframeRegex = /^[ \t]*@keyframe\s+([\w-]+)\s*\{([\s\S]*?)\}/gm;
  let keyMatch: RegExpExecArray | null;
  while ((keyMatch = keyframeRegex.exec(newText)) !== null) {
    const fullMatch = keyMatch[0];
    const keyName = keyMatch[1];
    const rawBlock = keyMatch[2];

    keyframeBlocks.push({
      name: keyName,
      rawBlock,
    });

    // ตัดทิ้ง
    newText = newText.replace(fullMatch, '').trim();
    keyframeRegex.lastIndex = 0; // reset
  }

  // -----------------------------------------
  // (3) parse directive top-level (@scope, @bind, etc.)
  // -----------------------------------------
  const directiveRegex = /^[ \t]*@([\w-]+)\s+([^\r\n]+)/gm;
  let dMatch: RegExpExecArray | null;
  directiveRegex.lastIndex = 0;
  while ((dMatch = directiveRegex.exec(newText)) !== null) {
    const dirName = dMatch[1];
    const dirValue = dMatch[2].trim();

    // ข้าม @use และ @query (ถ้ามี) ไปก่อน
    if (dirName === 'use' || dirName === 'query') {
      continue;
    }

    // ตรวจ @scope <name> (เฉพาะ a-z0-9_-)
    if (dirName === 'scope') {
      if (dirValue !== 'none') {
        const scopeNameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!scopeNameRegex.test(dirValue)) {
          throw new Error(
            `[CSS-CTRL-ERR] scope name must contain only letters, digits, underscore, or dash. Got: "${dirValue}"`
          );
        }
      }
    }

    directives.push({ name: dirName, value: dirValue });
    newText = newText.replace(dMatch[0], '').trim();
    directiveRegex.lastIndex = 0;
  }

  // -----------------------------------------
  // (4) parse .className { ... } ที่เหลือ (ระดับ top-level)
  // -----------------------------------------
  const blocks = parseClassBlocksWithBraceCounting(newText);
  for (const blk of blocks) {
    classBlocks.push(blk);
  }

  return {
    directives,
    classBlocks,
    constBlocks,
    keyframeBlocks,
  };
}

/**
 * mergeMultiLineParen
 * ฟังก์ชันสำหรับรวมหลายบรรทัดที่ยังอยู่ใน (...) ให้เป็น 1 บรรทัด
 * - พร้อมตรวจว่า (1) ห้ามมีวงเล็บซ้อน
 * - (2) ห้ามมี '{' / '>' / '@query' ภายใน (...), ตามแบบเดียวกับ .className
 */
function mergeMultiLineParen(rawLines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();

    // สแกนทีละตัวอักษร
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') {
        if (parenCount > 0) {
          throw new Error(
            `[CSS-CTRL-ERR] Nested parentheses not allowed in @const. Found: "${trimmed}"`
          );
        }
        parenCount++;
      } else if (ch === ')') {
        parenCount--;
      }
    }

    // ถ้า parenCount > 0 => ห้ามมี '{', '>', '@query'
    if (parenCount > 0) {
      if (trimmed.includes('>') || trimmed.includes('@query')) {
        throw new Error(
          `[CSS-CTRL-ERR] '>' or '@query' not allowed in (...). Found: "${trimmed}" (in @const)`
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
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found in @const. Line: "${trimmed}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error(
        '[CSS-CTRL-ERR] Missing closing ")" in @const parentheses. Or there is a use of ">query" or "pseudo-function" inside which can cause an error.'
      );
    }
    result.push(buffer);
  }

  return result;
}
