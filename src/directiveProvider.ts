import * as vscode from 'vscode';

export function createDirectiveProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // ต้องเป็นไฟล์ *.ctrl.ts เท่านั้น
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // ต้องลงท้ายด้วย '@'
        if (!textBeforeCursor.endsWith('@')) {
          return;
        }

        // (A) เคสพิเศษ: ถ้าอยู่หลัง "@query" แต่ยังไม่เปิด '{'
        if (isAfterQueryButNoBrace(document, position)) {
          // => Suggest เฉพาะ "scope"
          return [makeItem('scope', 'CSS-CTRL directive @scope (after @query)')];
        }

        // (B) ถ้าไม่เข้าเคสพิเศษ => ใช้ blockStack logic
        const stack = findBlockStack(document, position);

        // อยู่ในบล็อก @const => ไม่แนะนำ directive อื่น
        if (stack.includes('const')) {
          return undefined;
        }

        // อยู่ในบล็อก .class => แนะนำ use, query (หรือจะเพิ่ม keyframe ก็ได้)
        if (stack.includes('class')) {
          return [
            makeItem('use', 'CSS-CTRL directive @use (in class)'),
            makeItem('query', 'CSS-CTRL directive @query (in class)'),
            // ถ้าต้องการให้ @keyframe ใช้ใน class block ด้วย ก็ uncomment ด้านล่างได้
            // makeItem('keyframe', 'CSS-CTRL directive @keyframe (in class)'),
          ];
        }

        // อยู่ในบล็อก @query => แนะนำ scope
        if (stack.includes('query')) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (in query)')];
        }

        // (C) Top-level => แนะนำ scope, bind, const, และ keyframe  (**NEW**)
        return [
          makeItem('scope', 'CSS-CTRL Scope directive'),
          makeItem('bind', 'CSS-CTRL Bind directive'),
          makeItem('const', 'CSS-CTRL Abbe Constant directive'),
          makeItem('keyframe', 'CSS-CTRL Keyframe directive'), // **NEW**
        ];
      },
    },
    '@'
  );
}

function makeItem(name: string, detail: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Event);
  item.insertText = name;
  item.detail = detail;
  return item;
}

/**
 * isAfterQueryButNoBrace:
 * เช็คว่าในบรรทัด (จนถึง cursor) มี "@query"
 * แต่ยังไม่เจอ '{' และเจอ "@" ตรงปลาย => "กำลังจะพิมพ์ directive"
 */
function isAfterQueryButNoBrace(document: vscode.TextDocument, position: vscode.Position): boolean {
  const lineText = document.lineAt(position.line).text;
  const textBefore = lineText.slice(0, position.character);

  // cursor ลงท้ายด้วย '@' ?
  if (!textBefore.endsWith('@')) {
    return false;
  }

  // เอาเนื้อหาทั้งหมดจนถึง cursor
  const fullTextUpToCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );

  // (1) หา lastIndexOf('@query')
  const idxQuery = fullTextUpToCursor.lastIndexOf('@query');
  if (idxQuery === -1) {
    return false; // ไม่มี @query
  }

  // (2) จาก idxQuery จนถึง cursor => มี '{' ไหม
  const substringFromQuery = fullTextUpToCursor.slice(idxQuery, fullTextUpToCursor.length);
  if (substringFromQuery.includes('{')) {
    // block เปิดไปแล้ว => ไม่เข้าเคสพิเศษ
    return false;
  }

  // (3) ยังไม่เจอ '{' => ยังไม่เปิดบล็อก => เข้าสเต็ปพิเศษ => Return true
  return true;
}

/**
 * findBlockStack => parse open/close block
 */
function findBlockStack(document: vscode.TextDocument, position: vscode.Position): string[] {
  const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

  // **NEW**: เพิ่ม 'keyframe' ใน union type
  const tokens: { index: number; type: 'class' | 'const' | 'query' | 'close' | 'keyframe' }[] = [];

  // class => .xxxx {
  scanRegex(/\.\w+\s*\{/g, 'class');
  // const => @const ... {
  scanRegex(/@const\b[^\{]*\{/g, 'const');
  // query => @query ... {
  scanRegex(/@query\b[^\{]*\{/g, 'query');
  // **NEW** keyframe => @keyframe ... {
  scanRegex(/@keyframe\b[^\{]*\{/g, 'keyframe'); // **NEW**

  // close => }
  scanRegex(/\}/g, 'close');

  // เรียง token ตามลำดับที่เจอ
  tokens.sort((a, b) => a.index - b.index);

  // จำลอง stack (push เมื่อเจอเปิดบล็อก, pop เมื่อเจอ '}')
  const stack: string[] = [];
  for (const tk of tokens) {
    if (tk.type === 'close') {
      // เจอปิดบล็อก => pop ออก 1 ชั้น
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      // เจอบล็อกใหม่ => push เข้าสต็ก
      stack.push(tk.type);
    }
  }

  return stack;

  function scanRegex(re: RegExp, type: 'class' | 'const' | 'query' | 'close' | 'keyframe') {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(textUpToCursor)) !== null) {
      tokens.push({ index: m.index, type });
    }
  }
}
