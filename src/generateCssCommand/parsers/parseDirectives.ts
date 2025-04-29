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
 */
export function parseDirectives(text: string): IParseDirectivesResult {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];
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

    // ใช้ฟังก์ชันใหม่ mergeLineForConst
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
    let dirName = dMatch[1];
    let dirValue = dMatch[2].trim();

    // เดิมเช็ค ; => throw Error. ตอนนี้แก้เป็น remove ;
    if (dirName.includes(';')) {
      dirName = dirName.replace(/;/g, '');
    }
    if (dirValue.includes(';')) {
      dirValue = dirValue.replace(/;/g, '');
    }

    // ข้าม @use และ @query, @bind
    if (dirName === 'use' || dirName === 'query' || dirName === 'bind') {
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
 * เดิมเรา throw error ถ้าพบ ; -> ตอนนี้เปลี่ยนเป็นลบออก
 */
function mergeLineForConst(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = '';
  let parenCount = 0;
  let inCssFunc = false;

  for (const line of lines) {
    const trimmed = line.trim();

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (ch === '(') {
        // ตรวจดู context ละแวกนี้
        const ahead = trimmed.slice(i - 5, i + 1).toLowerCase();
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
        throw new Error(`[CSS-CTRL-ERR] Extra ")" found. Line: "${trimmed}"`);
      }

      // เดิม throw error ถ้าเจอ ';'
      // ตอนนี้เปลี่ยนเป็นลบออก
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
      throw new Error('[CSS-CTRL-ERR] Missing closing ")" in @const parentheses.');
    }
    if (buffer.includes(';')) {
      buffer = buffer.replace(/;/g, '');
    }
    result.push(buffer);
  }

  return result;
}
