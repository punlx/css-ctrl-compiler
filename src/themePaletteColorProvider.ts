// src/themePaletteColorProvider.ts

import * as vscode from 'vscode';

/**
 * createCssCtrlThemeColorProvider:
 *   DocumentColorProvider ที่จับเฉพาะไฟล์ชื่อ "ctrl.theme.ts" แล้ว parse palette
 *   เพื่อโชว์ swatch สี
 */
export function createCssCtrlThemeColorProvider() {
  return vscode.languages.registerColorProvider(
    {
      // ทำงานเฉพาะไฟล์ชื่อ ctrl.theme.ts (ในทุกโฟลเดอร์)
      pattern: '**/ctrl.theme.ts',
      scheme: 'file',
      language: 'typescript', // ไฟล์ .ts
    },
    new CssCtrlThemeColorProvider()
  );
}

class CssCtrlThemeColorProvider implements vscode.DocumentColorProvider {
  /**
   * provideDocumentColors:
   *   สแกนไฟล์ หาพิกัดสี (#RRGGBB / #RGBA / #RGB ฯลฯ) ในบล็อก
   *   export const palette = theme.palette([...]);
   */
  provideDocumentColors(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    const text = document.getText();

    // 1) ใช้ regex หาบล็อก: export const palette = theme.palette([...]);
    //    โดยจะดึงเนื้อใน array มาวิเคราะห์
    //    ตัวอย่าง regex คร่าว ๆ:
    //    /export\s+const\s+palette\s*=\s*theme\.palette\s*\(\s*\[\s*([\s\S]*?)\]\s*\)/m
    //    เน้นจับ group ข้างใน ([\s\S]*?)
    const mainRegex =
      /export\s+const\s+palette\s*=\s*theme\.palette\s*\(\s*\[\s*([\s\S]*?)\]\s*\)/m;
    const mainMatch = mainRegex.exec(text);
    if (!mainMatch) {
      // ไม่เจอ => ไม่มี palette => return empty
      return [];
    }

    // เนื้อในของ array
    const inside = mainMatch[1]; // เช่น `['light','dark'], ['tx-primary','#202024','#DCDBE9'], ...`

    // 2) เราจะหาค่าที่เป็น #xxxxxx ใน inside
    //    สร้าง array เก็บ ColorInformation
    const colorInfos: vscode.ColorInformation[] = [];

    // offset ของ inside ใน text
    // เพื่อคำนวณตำแหน่ง (line/col) จริงใน document
    const offsetOfInside = mainMatch.index + mainMatch[0].indexOf(inside);

    // สแกน color code
    // regex หา #3~8 หลัก (hex) หรือ rgba(...) ก็ปรับเพิ่มได้
    const colorRegex = /#[0-9A-Fa-f]{3,8}/g;
    let match: RegExpExecArray | null;

    while ((match = colorRegex.exec(inside)) !== null) {
      const colorStr = match[0]; // เช่น "#202024"
      const startInInside = match.index;
      const globalOffset = offsetOfInside + startInInside;

      // แปลง offset => Position
      const startPos = document.positionAt(globalOffset);
      const endPos = document.positionAt(globalOffset + colorStr.length);

      // parse เป็น vscode.Color
      const colorObj = parseHexColor(colorStr);
      if (!colorObj) continue;

      const range = new vscode.Range(startPos, endPos);
      colorInfos.push(new vscode.ColorInformation(range, colorObj));
    }

    return colorInfos;
  }

  /**
   * provideColorPresentations:
   *   ถ้าผู้ใช้แก้ไขสีใน ColorPicker, เราบอก VSCode ว่าจะแสดง / แทนที่ string เป็นอะไร
   */
  provideColorPresentations(
    color: vscode.Color,
    context: any, // หรือ { range: vscode.Range }
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    // สร้างเป็น "#RRGGBB"
    const hex = rgbToHex(color.red, color.green, color.blue);

    // Return 1 ตัว
    const presentation = new vscode.ColorPresentation(hex);
    return [presentation];
  }
}

/**
 * parseHexColor: แปลง #rgb / #rgba / #rrggbb / #rrggbbaa => vscode.Color
 */
function parseHexColor(hex: string): vscode.Color | undefined {
  const raw = hex.replace('#', '');
  if (raw.length === 3) {
    // #RGB
    const r = parseInt(raw[0] + raw[0], 16) / 255;
    const g = parseInt(raw[1] + raw[1], 16) / 255;
    const b = parseInt(raw[2] + raw[2], 16) / 255;
    return new vscode.Color(r, g, b, 1);
  } else if (raw.length === 4) {
    // #RGBA
    const r = parseInt(raw[0] + raw[0], 16) / 255;
    const g = parseInt(raw[1] + raw[1], 16) / 255;
    const b = parseInt(raw[2] + raw[2], 16) / 255;
    const a = parseInt(raw[3] + raw[3], 16) / 255;
    return new vscode.Color(r, g, b, a);
  } else if (raw.length === 6) {
    // #RRGGBB
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    return new vscode.Color(r, g, b, 1);
  } else if (raw.length === 8) {
    // #RRGGBBAA
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    const a = parseInt(raw.slice(6, 8), 16) / 255;
    return new vscode.Color(r, g, b, a);
  }
  return undefined;
}

/** rgbToHex: สร้าง "#RRGGBB" (ไม่รวม alpha) */
function rgbToHex(r: number, g: number, b: number): string {
  const rr = Math.round(r * 255)
    .toString(16)
    .padStart(2, '0');
  const gg = Math.round(g * 255)
    .toString(16)
    .padStart(2, '0');
  const bb = Math.round(b * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}
