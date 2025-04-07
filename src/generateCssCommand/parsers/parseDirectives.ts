// src/generateCssCommand/parsers/parseDirectives.ts

import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { parseClassBlocksWithBraceCounting } from '../helpers/parseClassBlocksWithBraceCounting';
import { IClassBlock, IConstBlock, IParsedDirective } from '../types';
import { parseSingleAbbr } from './parseSingleAbbr';

export function parseDirectives(text: string): {
  directives: IParsedDirective[];
  classBlocks: IClassBlock[];
  constBlocks: IConstBlock[];
} {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];

  let newText = text;

  // --------------------------------------------------------
  // (1) parse @const <name> { ... }
  // --------------------------------------------------------
  const constRegex = /^[ \t]*@const\s+([\w-]+)\s*\{([\s\S]*?)\}/gm;
  const allConstMatches = [...newText.matchAll(constRegex)];
  for (const m of allConstMatches) {
    const fullMatch = m[0];
    const constName = m[1];
    const rawBlock = m[2];

    const partialDef = createEmptyStyleDef();
    const lines = rawBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const ln of lines) {
      parseSingleAbbr(ln, partialDef, true, false);
    }

    constBlocks.push({ name: constName, styleDef: partialDef });

    // ลบส่วนนั้นออกจาก text
    newText = newText.replace(fullMatch, '').trim();
  }

  // --------------------------------------------------------
  // (2) parse directive top-level (@scope, @bind, etc.)
  // --------------------------------------------------------
  const directiveRegex = /^[ \t]*@([\w-]+)\s+([^\r\n]+)/gm;
  let dMatch: RegExpExecArray | null;
  directiveRegex.lastIndex = 0;
  while ((dMatch = directiveRegex.exec(newText)) !== null) {
    const dirName = dMatch[1];
    const dirValue = dMatch[2].trim();
    if (dirName === 'use' || dirName === 'query') {
      continue;
    }

    // (NEW) ถ้าเป็น @scope => ตรวจว่าค่าเป็น none, hash หรือเป็นชื่อปกติ
    // คุณอาจมี regex ตรวจพิเศษสำหรับ scopeName ก็ได้
    if (dirName === 'scope') {
      // ถ้า dirValue !== 'none' และ !== 'hash'
      // ก็ตรวจ regex ปกติ เช่น /^[a-zA-Z0-9_-]+$/
      if (dirValue !== 'none' && dirValue !== 'hash') {
        const scopeNameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!scopeNameRegex.test(dirValue)) {
          throw new Error(
            `[SWD-ERR] scope name must contain only letters, digits, underscore, or dash. Got: "${dirValue}"`
          );
        }
      }
    }

    // เก็บ directive ลง array
    directives.push({ name: dirName, value: dirValue });

    // ลบ directive ออกจาก newText เพื่อไม่ parse ซ้ำ
    newText = newText.replace(dMatch[0], '').trim();
    directiveRegex.lastIndex = 0;
  }

  // --------------------------------------------------------
  // (3) parse .className { ... }
  // --------------------------------------------------------
  const blocks = parseClassBlocksWithBraceCounting(newText);
  for (const blk of blocks) {
    classBlocks.push(blk);
  }

  return { directives, classBlocks, constBlocks };
}
