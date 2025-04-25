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

        // 1) เราให้ trigger เฉพาะ '@' ดังนั้น ถ้าไม่จบด้วย '@' ก็ไม่ทำงาน
        if (!textBeforeCursor.endsWith('@')) {
          return;
        }

        // --------------------------------------------------------
        // 2) เช็คเคสพิเศษ: ถ้าอยู่หลัง "@query" หรือ ">" แต่ยังไม่เปิด '{'
        //    => แสดง scope
        //
        //    โดยเราจะถือว่า '>' ทำหน้าที่เป็น query ก็ต่อเมื่อ '>' อยู่ก่อน @ นี้
        //    (เช่น user พิมพ์ "> @" หรือ ">    @")
        // --------------------------------------------------------

        // ตัด '@' ออก 1 ตัว เพื่อเช็คสิ่งที่อยู่ก่อนหน้า
        const textUpToBeforeAt = textBeforeCursor.slice(0, -1);

        // ถ้า isAfterQuerySymbolButNoBrace() เป็น true => Suggest "scope"
        if (isAfterQuerySymbolButNoBrace(document, position, textUpToBeforeAt)) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (after @query or >)')];
        }

        // 3) ถ้าไม่เข้าเคสพิเศษ => ใช้ blockStack logic
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
    // Trigger character เฉพาะ '@' เท่านั้น!
    '@'
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
 *  เช็คว่าก่อนหน้า '@' มี '@query' หรือ '>' บ้างไหม
 *  ถ้ามี (และยังไม่เปิด '{') => เป็นเคสพิเศษ: แสดง "scope"
 *
 *  - textUpToBeforeAt = ข้อความถึงก่อนหน้าตัว '@' ที่เพิ่งพิมพ์
 *    (เช่นผู้ใช้พิมพ์ ">    @" -> textUpToBeforeAt จะลงท้ายด้วย ">    ")
 */
function isAfterQuerySymbolButNoBrace(
  document: vscode.TextDocument,
  position: vscode.Position,
  textUpToBeforeAt: string
): boolean {
  // เอาเนื้อหาทั้งหมดจนถึง cursor (รวม '@')
  const fullTextUpToCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );

  // 1) หา lastIndexOf('@query')
  const idxQuery = fullTextUpToCursor.lastIndexOf('@query');

  // 2) เช็คว่ามี '>' ก่อนหน้า @ นี้ไหม
  //    ใช้ lastIndexOf('>') แล้วต้องอยู่ก่อน cursor แน่นอน
  const idxArrow = fullTextUpToCursor.lastIndexOf('>');

  // 3) ถ้า idxQuery < 0 และ idxArrow < 0 => ไม่มีสัญลักษณ์
  if (idxQuery < 0 && idxArrow < 0) {
    return false;
  }

  // เอาตำแหน่งหลังสุดของ symbol (อาจเป็น '@query' หรือ '>')
  const idxSymbol = Math.max(idxQuery, idxArrow);
  if (idxSymbol === -1) {
    // กันกรณีทั้งหมดเป็น -1
    return false;
  }

  // 4) จาก idxSymbol จนถึง cursor => มี '{' ไหม
  const substringFromSymbol = fullTextUpToCursor.slice(idxSymbol);
  if (substringFromSymbol.includes('{')) {
    // ถ้าเจอ '{' แปลว่าเปิด block ไปแล้ว => ไม่ใช่เคสพิเศษ
    return false;
  }

  // 5) สุดท้าย เช็คว่าก่อนหน้า '@' ลงท้ายด้วย '>' หรือเปล่า (เช่น ">    ")
  //    หรือเป็น '@query' แล้วตามด้วย whitespace? (เพื่อให้ "@query" + ... + "@" ก็ได้)
  //
  //    เนื่องจากเราจะถือว่า: ถ้า '>' อยู่ก่อน '@' => textUpToBeforeAt ต้อง match
  //    ส่วนกรณี '@query' ใน textUpToBeforeAt อาจจะมีคำอื่นขวางได้ แต่ idxSymbol ก็ยังอ้างอิงได้ว่าเป็นสัญลักษณ์ query
  //
  //    อย่างง่ายที่สุด เราอาจไม่ต้องเข้มงวดมาก:
  //    แค่เช็คว่า idxSymbol คือจุดล่าสุดของ '@query' หรือ '>' ยังไม่เจอ '{' -> ถือว่าเคสพิเศษ
  //    แล้วก็จบเลย

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
  //        (เพราะถือว่า > แทน @query)
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
