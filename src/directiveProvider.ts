// src/directiveProvider.ts
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

        // 2) เคสพิเศษ: ถ้า "ก่อนหน้า @" ในบรรทัดเดียวกัน มี '@query' หรือ '>' และยังไม่เปิด '{'
        //    => เสนอเฉพาะ "scope"
        if (isAfterQuerySymbolButNoBrace(document, position)) {
          return [makeItem('scope', 'CSS-CTRL directive @scope (after @query or >)')];
        }

        // 2.5) ถ้าอยู่ภายใน [ ... @ ] => Suggest "var" ที่ประกาศในไฟล์ (CompletionItemKind.Value)
        if (isInsideBracket(textBeforeCursor)) {
          const varNames = findAllVars(document);
          if (varNames.length > 0) {
            return varNames.map((v) => makeItem(v, `CSS-CTRL var "${v}"`, true));
          }
        }

        // 3) ใช้ blockStack logic เดิม
        const stack = findBlockStack(document, position);

        // อยู่ในบล็อก @const => ไม่แนะนำ directive อื่น
        if (stack.includes('const')) {
          return undefined;
        }

        // อยู่ในบล็อก .class => แนะนำ use, bind (CompletionItemKind.Event)
        if (stack.includes('class')) {
          return [
            makeItem('use', 'CSS-CTRL directive @use (in class)'),
            makeItem('bind', 'CSS-CTRL Bind directive (in class)'),
          ];
        }

        // Top-level => แนะนำ scope, const, keyframe, var (CompletionItemKind.Event)
        return [
          makeItem('scope', 'CSS-CTRL Scope directive'),
          makeItem('const', 'CSS-CTRL Abbe Constant directive'),
          makeItem('keyframe', 'CSS-CTRL Keyframe directive'),
          makeItem('var', 'CSS-CTRL Var directive'),
        ];
      },
    },
    '@'
  );
}

/**
 * สร้าง CompletionItem
 * - ถ้า isVar === true => CompletionItemKind.Value
 * - ถ้าไม่ใช่ => CompletionItemKind.Event
 */
function makeItem(name: string, detail: string, isVar?: boolean): vscode.CompletionItem {
  const kind = isVar ? vscode.CompletionItemKind.Variable : vscode.CompletionItemKind.Event;
  const item = new vscode.CompletionItem(name, kind);
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
  const textBeforeCursor = lineText.substring(0, position.character);
  const idxQuery = textBeforeCursor.lastIndexOf('@query');
  const idxArrow = textBeforeCursor.lastIndexOf('>');
  if (idxQuery < 0 && idxArrow < 0) {
    return false;
  }
  const idxSymbol = Math.max(idxQuery, idxArrow);
  const substringFromSymbol = textBeforeCursor.slice(idxSymbol);
  if (substringFromSymbol.includes('{')) {
    return false;
  }
  return true;
}

/**
 * ตรวจว่าอยู่ภายใน [ ... ] หรือไม่ (เช็คง่ายๆ แค่ก่อนหน้า '@' มี '[' แต่ยังไม่มี ']' ปิด)
 */
function isInsideBracket(textBeforeCursor: string): boolean {
  const lastOpenBracket = textBeforeCursor.lastIndexOf('[');
  const lastCloseBracket = textBeforeCursor.lastIndexOf(']');
  return lastOpenBracket !== -1 && lastOpenBracket > lastCloseBracket;
}

/**
 * หา list ของ var ที่ประกาศในไฟล์ (เช่น @var primary[red])
 */
function findAllVars(document: vscode.TextDocument): string[] {
  const text = document.getText();
  const reVar = /@var\s+([a-zA-Z_]\w*)\s*\[/g;
  const varNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = reVar.exec(text)) !== null) {
    varNames.push(match[1]);
  }
  return varNames;
}

/**
 * findBlockStack => parse open/close block
 */
function findBlockStack(document: vscode.TextDocument, position: vscode.Position): string[] {
  const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const tokens: {
    index: number;
    type: 'class' | 'const' | 'query' | 'close' | 'keyframe' | 'var';
  }[] = [];
  scanRegex(/\.\w+\s*\{/g, 'class');
  scanRegex(/@const\b[^\{]*\{/g, 'const');
  scanRegex(/@query\b[^\{]*\{|>\s*[^\{]*\{/g, 'query');
  scanRegex(/@keyframe\b[^\{]*\{/g, 'keyframe');
  scanRegex(/@var\b[^\{]*\{/g, 'var');
  scanRegex(/\}/g, 'close');
  tokens.sort((a, b) => a.index - b.index);
  const stack: string[] = [];
  for (const tk of tokens) {
    if (tk.type === 'close') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(tk.type);
    }
  }
  return stack;
  function scanRegex(re: RegExp, type: 'class' | 'const' | 'query' | 'close' | 'keyframe' | 'var') {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(textUpToCursor)) !== null) {
      tokens.push({ index: m.index, type });
    }
  }
}
