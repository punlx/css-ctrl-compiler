// src/generateCssCommand/parsers/parseDirectives.ts

import {
  IParseDirectivesResult,
  IParsedDirective,
  IClassBlock,
  IConstBlock,
  IKeyframeBlock,
} from '../types';
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { parseClassBlocksWithBraceCounting } from '../helpers/parseClassBlocksWithBraceCounting';
import { parseSingleAbbr } from './parseSingleAbbr';

/**
 * parseDirectives:
 *  - สแกนไฟล์หาคำสั่ง @const, @keyframe, @scope, @bind
 *  - ดึง .className { ... } ที่ระดับ top-level
 *  - ส่งผลลัพธ์เป็น IParseDirectivesResult
 *
 * (CHANGED) ปรับ mergeMultiLineParen เพื่อยอมให้มีฟังก์ชัน CSS ใน property value
 */
export function parseDirectives(text: string): IParseDirectivesResult {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];

  // --- ADDED FOR KEYFRAME ---
  const keyframeBlocks: IKeyframeBlock[] = [];

  let newText = text;

  // (1) parse @const <name> { ... }
  const constRegex = /^[ \t]*@const\s+([\w-]+)\s*\{([\s\S]*?)\}/gm;
  const allConstMatches = [...newText.matchAll(constRegex)];
  for (const m of allConstMatches) {
    const fullMatch = m[0];
    const constName = m[1];
    const rawBlock = m[2]; // เนื้อใน {...}

    const partialDef = createEmptyStyleDef();

    // (CHANGED) ใช้ฟังก์ชันใหม่ mergeLineForConst ที่ผ่อนปรนวงเล็บ CSS
    const splittedLines = rawBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const mergedLines = mergeLineForConst(splittedLines);

    for (const ln of mergedLines) {
      parseSingleAbbr(ln, partialDef, /*isConstContext=*/ true, /*isQueryBlock=*/ false);
    }

    constBlocks.push({ name: constName, styleDef: partialDef });
    newText = newText.replace(fullMatch, '').trim();
  }

  // (2) parse @keyframe <name> { ... }
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

    newText = newText.replace(fullMatch, '').trim();
    keyframeRegex.lastIndex = 0; // reset
  }

  // (3) parse directive top-level (@scope, @bind, etc.)
  const directiveRegex = /^[ \t]*@([\w-]+)\s+([^\r\n]+)/gm;
  let dMatch: RegExpExecArray | null;
  directiveRegex.lastIndex = 0;
  while ((dMatch = directiveRegex.exec(newText)) !== null) {
    const dirName = dMatch[1];
    const dirValue = dMatch[2].trim();

    // ข้าม @use และ @query
    if (dirName === 'use' || dirName === 'query') {
      continue;
    }
    directives.push({ name: dirName, value: dirValue });
    newText = newText.replace(dMatch[0], '').trim();
    directiveRegex.lastIndex = 0;
  }

  // (4) parse .className { ... } ที่เหลือ (ระดับ top-level)
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
 * (CHANGED) mergeLineForConst
 * ฟังก์ชันใหม่ (คล้าย mergeMultiLineParen เดิม) แต่ผ่อนปรน:
 *  - ยอมให้มีฟังก์ชัน CSS (rgba(..), calc(..)) ซ้อนใน property value
 *  - หากเจอ DSL function ซ้อน DSL function ค่อยเตือน (หรือตาม logic เดิม)
 */
function mergeLineForConst(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;
  let inCssFunc = false; // state สำหรับจับว่าอยู่ในฟังก์ชัน CSS หรือไม่

  for (const line of lines) {
    const trimmed = line.trim();

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (ch === '(') {
        // ตรวจดู context ละแวกนี้
        const ahead = trimmed.slice(i - 5, i + 1).toLowerCase();
        // ถ้าเจอเช่น "rgba(", "calc(", "hsl(", "url(", ...
        if (
          /\b(rgba|rgb|calc|hsl|hsla|url|clamp|var|min|max|attr|counter|counters|env|repeat|linear-gradient|radial-gradient|conic-gradient|image-set|matrix|translate|translateX|translateY|translateZ|translate3d|scale|scaleX|scaleY|scaleZ|scale3d|rotate|rotateX|rotateY|rotateZ|rotate3d|skew|skewX|skewY|perspective)\($/.test(
            ahead
          )
        ) {
          inCssFunc = true;
        } else {
          // DSL parentheses
          if (parenCount > 0 && !inCssFunc) {
            // ยังมี DSL paren ค้าง => nested DSL => ถ้าอยาก error ก็โยน
            throw new Error(
              `[CSS-CTRL-ERR] Nested DSL parentheses not allowed. Found: "${trimmed}"`
            );
          }
          parenCount++;
        }
      } else if (ch === ')') {
        if (inCssFunc) {
          // ปิดฟังก์ชัน CSS
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

    // ถ้าจบ parenCount <= 0 => push
    if (parenCount <= 0) {
      if (parenCount < 0) {
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. Line: "${trimmed}"`);
      }
      result.push(buffer);
      buffer = '';
      parenCount = 0;
      inCssFunc = false;
    }
  }

  if (buffer) {
    if (parenCount !== 0) {
      throw new Error(`[CSS-CTRL-ERR] Missing closing ")" in @const parentheses.`);
    }
    result.push(buffer);
  }

  return result;
}
