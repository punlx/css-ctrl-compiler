// src/cssTsColorProvider.ts

import * as vscode from 'vscode';
import { parseThemePaletteFull } from './parseTheme';
import { groupA, groupB, namedColorHex } from './constants';

/**
 * สมมุติว่า parseThemePaletteFull คืนค่า:
 * {
 *   "blue-100": { "dark":"#000000", "light":"#BBDEFB", "dim":"#90CAF9" },
 *   "blue-200": { "dark":"#64B5F6", "light":"#42A5F5", "dim":"#2196F3" },
 *   ...
 * }
 */
let paletteMap: Record<string, Record<string, string>> = {};

/**
 * initPaletteMap:
 * - เรียกตอน activate extension เพื่อลองหา ctrl.theme.ts ใน workspace
 * - parse เก็บใน paletteMap
 */
export async function initPaletteMap() {
  const found = await vscode.workspace.findFiles('**/ctrl.theme.ts', '**/node_modules/**', 1);
  if (found.length > 0) {
    paletteMap = parseThemePaletteFull(found[0].fsPath);
  } else {
    paletteMap = {};
  }
}

/**
 * createCssTsColorProvider:
 *  - ทำงานเฉพาะไฟล์ *.ctrl.ts (ต้องเป็น language=typescript, scheme=file)
 *  - ใช้ DocumentColorProvider เพื่อแสดง swatch สี ตาม pattern /([-\w&]+)\[([^\]]+)\]/g
 *    ex. "bg[--blue-100]", "c[#ffffff]", "bd-c[red]", "bd[2px solid red]"
 *    หรือ "--&color[red]"
 */
export function createCssTsColorProvider() {
  return vscode.languages.registerColorProvider(
    [
      { pattern: '**/*.ctrl.ts', scheme: 'file', language: 'typescript' },
      { pattern: '**/ctrl.theme.ts', scheme: 'file', language: 'typescript' },
    ],
    new CssTsColorProvider()
  );
}

class CssTsColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    // (1) หา comment // css-ctrl mode: xxx
    const docText = document.getText();
    const modeMatch = /\/\/\s*css-ctrl\s*mode:\s*(\w+)/.exec(docText);
    let mode: string | undefined;
    if (modeMatch) {
      mode = modeMatch[1]; // ex. "dark", "light", "dim"
    }

    // (2) จับ pattern /([-\w&]+)\[([^\]]+)\]/g
    //    เดิมคือ (\w+)\[([^\]]+)\] => ไม่รองรับ --&xxx
    const pattern = /([-\w&]+)\[([^\]]+)\]/g;
    const colorInfos: vscode.ColorInformation[] = [];

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(docText)) !== null) {
      const ab = match[1]; // ex. "bg", "bd-c", "--&color", ...
      const val = match[2]; // ex. "red", "#fff", "2px solid red", "--blue-100"

      // position ของ ab[...] ในไฟล์
      const matchIndex = match.index;

      // parse => ได้ ColorToken[]
      const tokens = parseValue(ab, val, mode, matchIndex, document);

      // สร้าง ColorInformation
      for (const ct of tokens) {
        colorInfos.push(
          new vscode.ColorInformation(
            new vscode.Range(
              document.positionAt(ct.startOffset),
              document.positionAt(ct.endOffset)
            ),
            ct.color
          )
        );
      }
    }

    return colorInfos;
  }

  provideColorPresentations(color: vscode.Color): vscode.ColorPresentation[] {
    // user ปรับสี => #rrggbb
    const hex = toHexRGB(color);
    return [new vscode.ColorPresentation(hex)];
  }
}

/** โครงสร้างเก็บ color + offset */
interface ColorToken {
  color: vscode.Color;
  startOffset: number;
  endOffset: number;
}

/**
 * parseValue:
 *  - ถ้า ab.startsWith('--&') => parse val เป็นสีเพียว (single token)
 *  - ถ้า groupA.has(ab) => parse single token
 *  - ถ้า groupB.has(ab) => split space
 *  - else => ไม่ parse
 */
function parseValue(
  ab: string,
  val: string,
  mode: string | undefined,
  matchIndex: number,
  document: vscode.TextDocument
): ColorToken[] {
  // (A) ถ้า ab ขึ้นต้นด้วย '--&'
  if (ab.startsWith('--')) {
    const c = getColorFromToken(val, mode);
    if (c) {
      const startOff = matchIndex + ab.length + 1; // +1 for '['
      const endOff = startOff + val.length;
      return [{ color: c, startOffset: startOff, endOffset: endOff }];
    }
    return [];
  }

  // (B) group A => val เป็นสีเดี่ยว
  if (groupA.has(ab)) {
    const c = getColorFromToken(val, mode);
    if (c) {
      const startOff = matchIndex + ab.length + 1;
      const endOff = startOff + val.length;
      return [{ color: c, startOffset: startOff, endOffset: endOff }];
    }
    return [];
  }

  // (C) group B => split space => parse
  if (groupB.has(ab)) {
    const tokens = val.split(/\s+/);
    const results: ColorToken[] = [];
    let currentPos = 0;
    const baseOffset = matchIndex + ab.length + 1;

    for (const tk of tokens) {
      const c = getColorFromToken(tk, mode);
      if (c) {
        const startOff = baseOffset + currentPos;
        const endOff = startOff + tk.length;
        results.push({ color: c, startOffset: startOff, endOffset: endOff });
      }
      currentPos += tk.length + 1; // +1 => space
    }
    return results;
  }

  // (D) ไม่เข้ากลุ่ม => ไม่ parse
  return [];
}

/**
 * getColorFromToken:
 *  - ถ้า token = "--xxx" => parse theme color
 *  - ถ้า token = "#xxx" => parse hex
 *  - ถ้า namedColorHex => parse
 */
function getColorFromToken(token: string, mode?: string): vscode.Color | undefined {
  // (1) Theme color => "--xxx"
  if (token.startsWith('--')) {
    if (!mode) return undefined;
    const key = token.replace(/^--/, '');
    const rec = paletteMap[key];
    if (!rec) return undefined;
    const colorHex = rec[mode];
    if (!colorHex) return undefined;
    return parseHexColor(colorHex);
  }

  // (2) Hex => "#xxxxxx"
  if (token.startsWith('#')) {
    return parseHexColor(token);
  }

  // (3) Named color => namedColorHex
  const lower = token.toLowerCase();
  if (namedColorHex[lower]) {
    return parseHexColor(namedColorHex[lower]);
  }

  return undefined;
}

/**
 * parseHexColor => vscode.Color
 *  รองรับ #rgb / #rgba / #rrggbb / #rrggbbaa
 */
function parseHexColor(hex: string): vscode.Color | undefined {
  const raw = hex.replace('#', '');
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16) / 255;
    const g = parseInt(raw[1] + raw[1], 16) / 255;
    const b = parseInt(raw[2] + raw[2], 16) / 255;
    return new vscode.Color(r, g, b, 1);
  } else if (raw.length === 4) {
    const r = parseInt(raw[0] + raw[0], 16) / 255;
    const g = parseInt(raw[1] + raw[1], 16) / 255;
    const b = parseInt(raw[2] + raw[2], 16) / 255;
    const a = parseInt(raw[3] + raw[3], 16) / 255;
    return new vscode.Color(r, g, b, a);
  } else if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    return new vscode.Color(r, g, b, 1);
  } else if (raw.length === 8) {
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    const a = parseInt(raw.slice(6, 8), 16) / 255;
    return new vscode.Color(r, g, b, a);
  }
  return undefined;
}

/** toHexRGB => "#rrggbb" */
function toHexRGB(color: vscode.Color): string {
  const r = Math.round(color.red * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(color.green * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(color.blue * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}
