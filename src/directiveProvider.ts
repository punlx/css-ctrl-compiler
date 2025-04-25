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

        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 1) ให้ trigger เฉพาะ '@'
        if (!textBeforeCursor.endsWith('@')) {
          return;
        }

        // 2) เคสพิเศษ: ถ้า "ก่อนหน้า @" ในบรรทัดเดียวกัน มี '@query' หรือ '>'
        //    และยังไม่เปิด '{' => เสนอเฉพาะ "scope"
        if (isAfterQuerySymbolButNoBrace(document, position)) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (after @query or >)')];
        }

        // 3) ถ้าไม่เข้าเคสพิเศษ => ใช้ blockStack logic เดิม
        const stack = findBlockStack(document, position);

        // อยู่ในบล็อก @const => ไม่แนะนำ directive อื่น
        if (stack.includes('const')) {
          return undefined;
        }

        // อยู่ในบล็อก .class => แนะนำ use, query
        if (stack.includes('class')) {
          return [
            makeItem('use', 'CSS-CTRL directive @use (in class)'),
            makeItem('query', 'CSS-CTRL directive @query (in class)'),
          ];
        }

        // อยู่ในบล็อก @query (หรือ '>' ที่นับเป็น query) => แนะนำ scope
        if (stack.includes('query')) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (in query)')];
        }

        // Top-level => แนะนำ scope, bind, const, keyframe
        return [
          makeItem('scope', 'CSS-CTRL Scope directive'),
          makeItem('bind', 'CSS-CTRL Bind directive'),
          makeItem('const', 'CSS-CTRL Abbe Constant directive'),
          makeItem('keyframe', 'CSS-CTRL Keyframe directive'),
        ];
      },
    },
    // Trigger character เฉพาะ '@'
    '@'
  );
}

/**
 * สร้าง CompletionItem
 */
function makeItem(name: string, detail: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Event);
  item.insertText = name;
  item.detail = detail;
  return item;
}

/**
 * isAfterQuerySymbolButNoBrace:
 *  - ตรวจสอบเฉพาะ **บรรทัดเดียวกัน** (ไม่สแกนทั้งไฟล์) ว่าก่อนหน้า '@' มี "@query" หรือ ">" ไหม
 *  - หากมี และยังไม่เปิด '{' => เคสพิเศษ: เสนอเฉพาะ "scope"
 */
function isAfterQuerySymbolButNoBrace(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const lineText = document.lineAt(position.line).text;
  // substring ก่อน cursor
  const textBeforeCursor = lineText.substring(0, position.character);

  // 1) หา lastIndexOf('@query') หรือ '>' ในบรรทัดนี้
  const idxQuery = textBeforeCursor.lastIndexOf('@query');
  const idxArrow = textBeforeCursor.lastIndexOf('>');

  // ถ้าไม่มีสักอัน => ไม่เข้าเคส
  if (idxQuery < 0 && idxArrow < 0) {
    return false;
  }

  // เอาตำแหน่งที่มากกว่า (latest)
  const idxSymbol = Math.max(idxQuery, idxArrow);

  // 2) ตรวจว่าหลังจาก symbol จนถึงจุด cursor มี '{' ไหม
  const substringFromSymbol = textBeforeCursor.slice(idxSymbol);
  if (substringFromSymbol.includes('{')) {
    // ถ้าเปิดบล็อกแล้ว => ไม่ใช่เคสพิเศษ
    return false;
  }

  // ถ้ามาถึงนี่ => แปลว่าเจอ '@query' หรือ '>' ในบรรทัดนี้
  // และยังไม่เจอ '{' => ถือเป็นเคสพิเศษ
  return true;
}

/**
 * findBlockStack => parse open/close block
 *  - ลูปอ่าน textUpToCursor ทั้งหมด แล้วใช้ regex หาโทเค็นเปิด/ปิดบล็อก
 *  - stack.push(...) เมื่อเจอเปิดบล็อก, stack.pop() เมื่อเจอปิดบล็อก
 *  - ถ้าเจอ @query หรือ '>' + '{' => ถือเป็น 'query'
 */
function findBlockStack(document: vscode.TextDocument, position: vscode.Position): string[] {
  const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

  const tokens: { index: number; type: 'class' | 'const' | 'query' | 'close' | 'keyframe' }[] = [];

  // .class {
  scanRegex(/\.\w+\s*\{/g, 'class');
  // @const ... {
  scanRegex(/@const\b[^\{]*\{/g, 'const');
  // @query ... { หรือ > ... {
  scanRegex(/@query\b[^\{]*\{|>\s*[^\{]*\{/g, 'query');
  // @keyframe ... {
  scanRegex(/@keyframe\b[^\{]*\{/g, 'keyframe');
  // }
  scanRegex(/\}/g, 'close');

  tokens.sort((a, b) => a.index - b.index);

  const stack: string[] = [];
  for (const tk of tokens) {
    if (tk.type === 'close') {
      // เจอ '}'
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      // เจอเปิดบล็อก => push
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
