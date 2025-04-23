// src/generateCssCommand/parsers/parseDirectives.ts

import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';
import { parseClassBlocksWithBraceCounting } from '../helpers/parseClassBlocksWithBraceCounting';
import {
  IClassBlock,
  IConstBlock,
  IParsedDirective,
  IParseDirectivesResult,
  IKeyframeBlock,
} from '../types';
import { parseSingleAbbr } from './parseSingleAbbr';

export function parseDirectives(text: string): IParseDirectivesResult {
  const directives: IParsedDirective[] = [];
  const classBlocks: IClassBlock[] = [];
  const constBlocks: IConstBlock[] = [];

  // --- ADDED FOR KEYFRAME ---
  // เก็บ @keyframe
  const keyframeBlocks: IKeyframeBlock[] = [];

  let newText = text;

  // (1) parse @const <name> { ... }
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

    newText = newText.replace(fullMatch, '').trim();
  }

  // --- ADDED FOR KEYFRAME ---
  // (2) parse @keyframe <name> { ... }
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

    // ตัดส่วนนี้ทิ้งจาก newText
    newText = newText.replace(fullMatch, '').trim();
    // เนื่องจากเราเปลี่ยน newText => reset regex
    keyframeRegex.lastIndex = 0;
  }

  // (3) parse directive top-level (@scope, @bind, etc.)
  const directiveRegex = /^[ \t]*@([\w-]+)\s+([^\r\n]+)/gm;
  let dMatch: RegExpExecArray | null;
  directiveRegex.lastIndex = 0;
  while ((dMatch = directiveRegex.exec(newText)) !== null) {
    const dirName = dMatch[1];
    const dirValue = dMatch[2].trim();
    if (dirName === 'use' || dirName === 'query') {
      continue;
    }

    // (REMOVED) เดิมเคย check hash ใน if (dirValue !== 'none' && dirValue !== 'hash')
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

  // (4) parse .className { ... }
  const blocks = parseClassBlocksWithBraceCounting(newText);
  for (const blk of blocks) {
    classBlocks.push(blk);
  }

  return {
    directives,
    classBlocks,
    constBlocks,

    // --- ADDED FOR KEYFRAME ---
    keyframeBlocks,
  };
}
