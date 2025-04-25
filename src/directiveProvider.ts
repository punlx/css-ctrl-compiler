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

        // (1) เช็คให้ trigger ได้ทั้ง '@' และ '>'
        // เดิม: if (!textBeforeCursor.endsWith('@')) { ... }
        // ใหม่: ถ้าไม่ได้ลงท้ายด้วย '@' และไม่ได้ลงท้ายด้วย '>'
        if (
          !textBeforeCursor.endsWith('@') &&
          !textBeforeCursor.endsWith('>')
        ) {
          return;
        }

        // (2) เคสพิเศษ: ถ้าอยู่หลัง "@query" หรือ ">" (ที่ทำหน้าที่เหมือน query) แต่ยังไม่เปิด '{'
        //     => ให้ suggest "scope"
        if (isAfterQuerySymbolButNoBrace(document, position)) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (after @query or >)')];
        }

        // (3) ถ้าไม่เข้าเคสพิเศษ => ใช้ blockStack logic
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
    '@',
    '>' // (เพิ่ม trigger char '>' ด้วย)
  );
}

// สร้าง CompletionItem ช่วย
function makeItem(name: string, detail: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Event);
  item.insertText = name;
  item.detail = detail;
  return item;
}

/**
 * isAfterQuerySymbolButNoBrace:
 * เช็คว่าในโค้ด (จนถึง cursor) มี "@query" หรือ ">"
 * แต่ยังไม่เจอ '{' และ cursor เพิ่งพิมพ์ '@' หรือ '>' => "กำลังจะพิมพ์ directive"
 */
function isAfterQuerySymbolButNoBrace(document: vscode.TextDocument, position: vscode.Position): boolean {
  const lineText = document.lineAt(position.line).text;
  const textBefore = lineText.slice(0, position.character);

  // cursor ลงท้ายด้วย '@' หรือ '>' ?
  if (!textBefore.endsWith('@') && !textBefore.endsWith('>')) {
    return false;
  }

  // เอาเนื้อหาทั้งหมดจนถึง cursor
  const fullTextUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

  // (1) หา lastIndexOf('@query') หรือ '>'
  const idxQuery = fullTextUpToCursor.lastIndexOf('@query');
  const idxArrow = fullTextUpToCursor.lastIndexOf('>');

  // สมมติถือว่า '>' แทน @query => เราจะใช้ค่าที่มากกว่ากันเป็น "จุดล่าสุด"
  const idxSymbol = Math.max(idxQuery, idxArrow);
  if (idxSymbol === -1) {
    return false; // ไม่มีทั้ง '@query' และ '>'
  }

  // (2) จาก idxSymbol จนถึง cursor => มี '{' ไหม
  const substringFromSymbol = fullTextUpToCursor.slice(idxSymbol, fullTextUpToCursor.length);
  if (substringFromSymbol.includes('{')) {
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

  // เพิ่ม 'keyframe' ใน type
  const tokens: { index: number; type: 'class' | 'const' | 'query' | 'close' | 'keyframe' }[] = [];

  // class => .xxxx {
  scanRegex(/\.\w+\s*\{/g, 'class');
  // const => @const ... {
  scanRegex(/@const\b[^\{]*\{/g, 'const');
  // query => จับทั้ง @query ... { หรือ > ... {
  scanRegex(/@query\b[^\{]*\{|>\s*[^\{]*\{/g, 'query');
  // keyframe => @keyframe ... {
  scanRegex(/@keyframe\b[^\{]*\{/g, 'keyframe');
  // close => }
  scanRegex(/\}/g, 'close');

  tokens.sort((a, b) => a.index - b.index);

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
