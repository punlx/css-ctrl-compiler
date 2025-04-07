// src/generateCssCommand/helpers/parseClassBlocksWithBraceCounting.ts

import { IClassBlock } from '../types';

export function parseClassBlocksWithBraceCounting(text: string): IClassBlock[] {
  const result: IClassBlock[] = [];

  const pattern = /\.([\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const className = match[1];
    const startIndex = pattern.lastIndex;
    let braceCount = 1;
    let i = startIndex;
    for (; i < text.length; i++) {
      if (text[i] === '{') {
        braceCount++;
      } else if (text[i] === '}') {
        braceCount--;
      }
      if (braceCount === 0) {
        break;
      }
    }
    const body = text.slice(startIndex, i).trim();

    result.push({
      className,
      body,
    });
  }

  return result;
}
