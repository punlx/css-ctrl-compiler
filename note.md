**parseBaseStyle**

NEW

if (styleAbbr.startsWith('--')) {
// e.g. --color[red]
if (!styleAbbr.startsWith('--&')) {
// สมมุติอนุญาตในทุกบริบท (รวม @query, @const) ตามโค้ดเก่า
const rawName = styleAbbr.slice(2);
if (!rawName) {
throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${abbrLine}"`);
}

      if (!(styleDef as any).plainLocalVars) {
        (styleDef as any).plainLocalVars = {};
      }
      (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(propValue);
      return;
    }

}

OLD
if (styleAbbr.startsWith('--')) {
// e.g. --color[red]
// ไม่ rename ใด ๆ => ออกมาเป็น --color: red;
// สมมุติอนุญาตในทุกบริบท (รวม @query, @const)
// ถ้าต้องการห้ามใน @const => throw error ได้

    const rawName = styleAbbr.slice(2); // e.g. "color"
    if (!rawName) {
      throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${abbrLine}"`);
    }

    // สร้าง plainLocalVars ถ้ายังไม่มี
    if (!(styleDef as any).plainLocalVars) {
      (styleDef as any).plainLocalVars = {};
    }
    (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(propValue);
    return;

}

---
