import * as vscode from 'vscode';

/**
 * ghostThemePropDecorationType:
 *  DecorationType สำหรับ "theme property"
 */
export const ghostThemePropDecorationType = vscode.window.createTextEditorDecorationType({});

/**
 * themePropertyMap:
 *  เก็บจาก defineMap (เช่น { button:["primary","secondary"], card:["card1","card2"] })
 *  ไว้ตรวจสอบว่า propertyName ที่พบ เช่น "button" มีใน themePropertyMap ไหม
 */
let themePropertyMap: Record<string, string[]> = {};

/**
 * initThemePropertyMap:
 *  เรียกใช้ใน extension.ts หลัง parseThemeDefine(...) ได้ defineMap แล้ว
 */
export function initThemePropertyMap(map: Record<string, string[]>) {
  themePropertyMap = map;
}

/**
 * updateThemePropertyDecorations:
 *  - เรียกเมื่อ text เปลี่ยน หรือเปลี่ยน active editor
 *  - ถ้าไฟล์ไม่ใช่ .ctrl.ts หรือ ctrl.theme.ts => เคลียร์ decoration
 *  - ถ้าใช่ => regex จับ pattern "<word>[..."
 *    แล้ว check <word> ว่าอยู่ใน themePropertyMap หรือไม่
 *    ถ้าอยู่ => แสดง ghost text ":theme"
 */
export function updateThemePropertyDecorations(editor: vscode.TextEditor) {
  if (
    !editor.document.fileName.endsWith('.ctrl.ts') &&
    !editor.document.fileName.endsWith('ctrl.theme.ts')
  ) {
    editor.setDecorations(ghostThemePropDecorationType, []);
    return;
  }

  const text = editor.document.getText();
  const lines = text.split('\n');

  // จับ pattern (word)[
  // เช่น "button[" หรือ "card["
  // \b[a-zA-Z_][\w-]* => ต้องขึ้นต้นด้วย a-z หรือ _ ตามด้วย a-z0-9_-
  const pattern = /(\b[a-zA-Z_][\w-]*)\[/g;

  const newDecorations: vscode.DecorationOptions[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      const propertyName = match[1];

      if (themePropertyMap.hasOwnProperty(propertyName)) {
        const startIndex = match.index + propertyName.length;

        const range = new vscode.Range(lineIndex, startIndex, lineIndex, startIndex);

        newDecorations.push({
          range,
          renderOptions: {
            after: {
              contentText: ':theme',
              fontStyle: 'italic',
              color: '#606060',
            },
          },
        });
      }
    }
  }

  editor.setDecorations(ghostThemePropDecorationType, newDecorations);
}
