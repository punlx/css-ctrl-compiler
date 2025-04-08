// src/generateCssCommand/helpers/parseClassBlocksWithBraceCounting.ts

import { IClassBlock } from '../types';

/**
 * parseClassBlocksWithBraceCounting:
 *  - สแกนไฟล์ทั้งหมด แล้วดึงเฉพาะ .className { ... } ที่อยู่ระดับบนสุด (braceCount == 0)
 *  - ถ้า .className { ... } อยู่ใน block อื่น => ข้าม
 */
export function parseClassBlocksWithBraceCounting(text: string): IClassBlock[] {
  const result: IClassBlock[] = [];

  let braceCount = 0;
  let i = 0;
  const length = text.length;

  // ตัวอย่าง regex ที่จะ match ".className {"
  // แต่ยังไม่ใช้ .exec(...) ตรง ๆ; เราจะใช้ re.match() ตำแหน่ง i
  const classPattern = /^\.([\w-]+)\s*\{/;

  while (i < length) {
    const c = text[i];
    if (c === '{') {
      braceCount++;
    } else if (c === '}') {
      braceCount--;
      if (braceCount < 0) braceCount = 0; // กัน error
    }

    // ถ้าเรากำลังอยู่ top-level => ลองดูว่า substring นี้ match ".className {"
    if (braceCount === 0) {
      // สร้าง substring ตั้งแต่ i
      const sub = text.slice(i);
      const m = sub.match(classPattern);
      if (m) {
        // แปลว่าเราพบ .className { ที่ top-level
        const className = m[1];

        // ตำแหน่งเริ่ม block = i + length ของ match[0]
        const blockStart = i + m[0].length;

        // ตอนนี้ เราถือว่าเปิด { ไปแล้ว 1
        let nested = 1;
        let j = blockStart;
        for (; j < length; j++) {
          if (text[j] === '{') nested++;
          else if (text[j] === '}') nested--;
          if (nested === 0) {
            // ปิดครบ
            break;
          }
        }

        // body = เนื้อใน {...}
        const body = text.slice(blockStart, j).trim();

        // push ผลลัพธ์
        result.push({
          className,
          body,
        });

        // ขยับ i ไปหลังปิดบล็อก
        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return result;
}
