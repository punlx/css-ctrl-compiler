/* parseDirectives.ts */

import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { parseClassBlocksWithBraceCounting } from '../helpers/parseClassBlocksWithBraceCounting';
import { parseSingleAbbr } from './parseSingleAbbr';
import { parseNestedQueryBlocks } from '../utils/parseNestedQueryBlocks';
import {
  IStyleDefinition,
  IClassBlock,
  IConstBlock,
  IParsedDirective,
  IParseDirectivesResult,
  IKeyframeBlock,
  INestedQueryNode,
} from '../types';

/**
 * parseDirectives:
 *  - สแกนไฟล์หาคำสั่ง @const, @keyframe, @scope, @bind ฯลฯ
 *  - ดึง .className {...} ที่ระดับ top-level
 *  - ส่งผลลัพธ์เป็น IParseDirectivesResult
 */
export function parseDirectives(text: string): IParseDirectivesResult {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];

  // --- ADDED FOR KEYFRAME ---
  // เก็บ @keyframe
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
    const rawBlock = m[2];

    // สร้าง styleDef ว่าง
    const partialDef = createEmptyStyleDef();

    // ------
    // วิธีเก่า (flow เดิม) ที่ต้องการ: 
    //   1) ห้ามมี @query หรือ '>' (ที่จะแปลงเป็น @query) ภายใน @const block
    //   2) ถ้าเจอ => throw Error ทันที
    // ------

    // ขั้นแรก เรา split บรรทัดก่อน เพื่อ parse ทีละบรรทัด
    // แล้วค่อยเช็คว่ามี pattern @query หรือ '>' หรือไม่
    const lines = rawBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const ln of lines) {
      // เช็คง่าย ๆ ว่ามี @query หรือไม่
      if (ln.startsWith('@query')) {
        throw new Error(
          `[CSS-CTRL-ERR] @query is not allowed in @const or theme.define() block. Found: "${ln}"`
        );
      }
      // เช็คว่าขึ้นต้นด้วย '>' (หรือมี '>' ในระดับ top-level)
      // เพื่อโยน error ว่าเป็น nested query
      // (อาจเช็ค regex ที่ซับซ้อนกว่านี้ได้ ถ้าต้องการความเป๊ะ)
      if (/^\>\s*\S/.test(ln)) {
        // ถ้าเจอ > .a  => error ทันที
        throw new Error(
          `[CSS-CTRL-ERR] @query is not allowed in @const or theme.define() block. Found: "${ln}"`
        );
      }

      // ถ้าไม่มี > หรือ @query => parse Abbreviation ตามปกติ
      parseSingleAbbr(ln, partialDef, /*isConstContext*/ true, /*isQueryBlock*/ false);
    }

    // เก็บเป็น IConstBlock
    constBlocks.push({ name: constName, styleDef: partialDef });

    // ตัด substring ที่ match ออก เพื่อไม่ให้ไป parse ซ้ำ
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

    // สร้าง IKeyframeBlock เก็บชื่อ + เนื้อหาดิบ
    keyframeBlocks.push({
      name: keyName,
      rawBlock,
    });

    // ตัดส่วนที่ match ออก
    newText = newText.replace(fullMatch, '').trim();
    keyframeRegex.lastIndex = 0; // reset regex
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

    // ตรวจ @scope <name> ให้เป็น a-z0-9_-
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
  // (4) parse .className { ... } ที่เหลือ
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
