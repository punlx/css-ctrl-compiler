import * as vscode from 'vscode';

export function createDirectiveProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // ต้องลงท้ายด้วย '@'
        if (!textBeforeCursor.endsWith('@')) {
          return;
        }

        // (A) เคสพิเศษ: อยู่หลัง "@query" แต่ยังไม่เปิด '{'
        if (isAfterQueryButNoBrace(document, position)) {
          // => Suggest เฉพาะ "scope"
          return [ makeItem('scope', 'CSS-CTRL directive @scope (after @query)') ];
        }

        // (B) ถ้าไม่เข้าเคสพิเศษ => ใช้ blockStack logic
        const stack = findBlockStack(document, position);

        if (stack.includes('const')) {
          return undefined;
        }
        if (stack.includes('class')) {
          return [
            makeItem('use', 'CSS-CTRL directive @use (in class)'),
            makeItem('query', 'CSS-CTRL directive @query (in class)'),
          ];
        }
        if (stack.includes('query')) {
          return [ makeItem('scope', 'CSS-CTRL directive @scope (in query)') ];
        }

        // default => top-level
        return [
          makeItem('scope', 'CSS-CTRL Scope directive'),
          makeItem('bind', 'CSS-CTRL Bind directive'),
          makeItem('const', 'CSS-CTRL Abbe Constant directive'),
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
    new vscode.Range(new vscode.Position(0,0), position)
  );

  // (1) หา lastIndexOf('@query')
  const idxQuery = fullTextUpToCursor.lastIndexOf('@query');
  if (idxQuery === -1) {
    return false; // ไม่มี @query
    
  }

  // (2) จาก idxQuery จนถึง cursor => มี '{' ไหม
  const substringFromQuery = fullTextUpToCursor.slice(idxQuery, fullTextUpToCursor.length);
  // ถ้ามี '{' => block เปิด => return false
  if (substringFromQuery.includes('{')) {
    return false;
  }

  // (3) ถ้าไม่มี '{' => block ยังไม่เปิด => Return true => Suggest scope
  return true;
}

/**
 * findBlockStack => (ของเดิม) parse open/close block
 */
function findBlockStack(document: vscode.TextDocument, position: vscode.Position): string[] {
  const textUpToCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );

  const tokens: { index: number; type: 'class'|'const'|'query'|'close' }[] = [];

  scanRegex(/\.\w+\s*\{/g, 'class');
  scanRegex(/@const\b[^\{]*\{/g, 'const');
  scanRegex(/@query\b[^\{]*\{/g, 'query');
  scanRegex(/\}/g, 'close');

  tokens.sort((a,b)=> a.index - b.index);

  const stack: string[] = [];
  for (const tk of tokens) {
    if (tk.type === 'close') {
      if (stack.length>0) {
        stack.pop();
      }
    } else {
      stack.push(tk.type);
    }
  }

  return stack;

  function scanRegex(re: RegExp, type: 'class'|'const'|'query'|'close') {
    re.lastIndex = 0;
    let m: RegExpExecArray|null;
    while ((m = re.exec(textUpToCursor))!==null) {
      tokens.push({ index: m.index, type });
    }
  }
}
