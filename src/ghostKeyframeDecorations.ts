import * as vscode from 'vscode';

export const ghostKeyframeDecorationType = vscode.window.createTextEditorDecorationType({});

let themeKeyframeNames: string[] = [];

export function initThemeKeyframeNames(keyNames: string[]) {
  themeKeyframeNames = keyNames;
}

export function updateKeyframeDecorations(editor: vscode.TextEditor) {
  if (!editor.document.fileName.endsWith('.ctrl.ts')) {
    editor.setDecorations(ghostKeyframeDecorationType, []);
    return;
  }

  const text = editor.document.getText();
  const lines = text.split('\n');

  const newDecorations: vscode.DecorationOptions[] = [];

  // regex จับ am[...] หรือ am-n[...]  => group(2) = เนื้อในวงเล็บ
  const pattern = /(am|am-n)\[([^\]]+)\]/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      // match[2] => "move 0.2s ease"
      const bracketContent = match[2].trim();

      // สมมุติคำแรกคือชื่อ keyframe
      const keyframeName = bracketContent.split(/\s+/)[0];

      if (themeKeyframeNames.includes(keyframeName)) {
        // หา offset เริ่มต้นของเนื้อหาในวงเล็บ => bracketStartIndex
        //  - match.index คือจุดเริ่มต้น "am["
        //  - match[0] คือ "am[move 0.2s ease]"
        //  - match[0].indexOf('[') หาค่า index '[' ใน substring => เพื่อรู้ว่าตัวอักษรตัวไหนคือ '['
        //  สรุป bracketStartIndex = ตำแหน่งของ char ตัวแรกใน [ ... ] (i.e. 'm' ของ "move")
        const bracketStartIndex = match.index + match[0].indexOf('[') + 1;

        // หา offset ของ keyframeName ภายใน bracketContent
        //  เช่น "move 0.2s ease".indexOf("move") => 0
        const keyNameOffset = bracketContent.indexOf(keyframeName);

        // สุดท้ายคือ finalPos = bracketStartIndex + keyNameOffset + keyframeName.length
        //  => ตำแหน่งท้าย "move"
        const finalPos = bracketStartIndex + keyNameOffset + keyframeName.length;

        const range = new vscode.Range(lineIndex, finalPos, lineIndex, finalPos);

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

  editor.setDecorations(ghostKeyframeDecorationType, newDecorations);
}
