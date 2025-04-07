// localVarProvider.ts
import * as vscode from 'vscode';

/**
 * createLocalVarProvider:
 * - Trigger เมื่อผู้ใช้พิมพ์ '--&' ในไฟล์ .ctrl.ts
 * - ถ้าอยู่ใน @const block => Suggest local variable ทั้งไฟล์
 * - ถ้าอยู่ใน .className block => Suggest local variable ที่อยู่ภายในคลาสนั้น
 */
export function createLocalVarProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) ต้องเป็นไฟล์ .ctrl.ts เท่านั้น
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) อ่านข้อความในบรรทัด + ก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 3) ตรวจ pattern คร่าว ๆ ว่าผู้ใช้พิมพ์ '--&' หรือกำลังพิมพ์ local var
        //    ตัวอย่างง่าย: จับ '--&' หรือ '--&abc'
        //    ถ้าไม่ตรง ก็ไม่ suggest
        const localVarPrefixRegex = /--\&([\w-]*)/;
        const match = localVarPrefixRegex.exec(textBeforeCursor);
        if (!match) {
          return;
        }

        // 4) Parse ทั้งไฟล์ => ได้ localVarInfo { allVars, classVarsMap }
        const localVarInfo = parseLocalVariables(document);

        // 5) เช็ก scope (อยู่ใน @const หรืออยู่ใน .className ใด)
        const isInConstScope = checkIfInsideConstBlock(document, position);
        const className = getClassNameAtPosition(document, position); // ถ้าอยู่ใน class จะได้ เช่น ".main" หรือ ".test"

        // 6) เลือกชุด localVar ที่จะ suggest
        let candidateVars: string[] = [];
        if (isInConstScope) {
          // อยู่ใน @const => เอาทุกตัว
          candidateVars = Array.from(localVarInfo.allVars);
        } else if (className && localVarInfo.classVarsMap[className]) {
          // อยู่ใน .className => เอาตัวที่อยู่ในคลาสนั้น
          candidateVars = Array.from(localVarInfo.classVarsMap[className]);
        } else {
          // ไม่อยู่ทั้ง @const และไม่อยู่ในคลาสไหน => จะให้ suggest อะไร?
          // อาจจะไม่ suggest หรือจะ suggest all ก็แล้วแต่ requirement
          candidateVars = [];
        }

        // 7) สร้าง CompletionItem ตาม candidateVars
        //    ผู้ใช้พิมพ์ '--&' ไปแล้ว => insertText = ชื่อ var เฉย ๆ
        //    เช่น varName = "tx-test-main-1"
        //    จะได้ "--&tx-test-main-1" แบบอัตโนมัติ
        const completions: vscode.CompletionItem[] = candidateVars.map((varName) => {
          const item = new vscode.CompletionItem(varName, vscode.CompletionItemKind.Variable);
          item.detail = `Local variable declared as --${varName}`;

          // insertText = varName, เพราะมี '--&' ไปแล้วใน editor
          item.insertText = varName;

          return item;
        });

        return completions;
      },
    },
    '&'
  );
}

/** โครงสร้างเก็บข้อมูล local variable */
interface LocalVarInfo {
  allVars: Set<string>;
  classVarsMap: Record<string, Set<string>>;
}

/**
 * parseLocalVariables:
 * - สแกนทั้งไฟล์ .ctrl.ts
 * - ใช้วิธี stack เพื่อรู้ว่าอยู่ใน block ของ .className ไหน หรืออยู่ใน block @const
 * - ทุกครั้งที่เจอ local variable รูป `--&xxxx[...]` ให้เก็บไว้ใน allVars
 *   และใน classVarsMap[className] (ถ้าอยู่ใน class block)
 */
function parseLocalVariables(document: vscode.TextDocument): LocalVarInfo {
  const text = document.getText();
  const lines = text.split('\n');

  const localVarInfo: LocalVarInfo = {
    allVars: new Set<string>(),
    classVarsMap: {},
  };

  let currentClass: string | null = null;
  let stack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // เช็คเปิดบล็อก class => .xxx {
    // จับ .classname (เช่น .main) => push stack ว่า "class:.main"
    const classOpenMatch = /^\s*\.(\w[\w-]*)\s*\{/.exec(line);
    if (classOpenMatch) {
      const clsName = '.' + classOpenMatch[1];
      stack.push(`class:${clsName}`);
    }

    // เช็คเปิดบล็อก @const => push stack ว่า "const:someName"
    const constOpenMatch = /^\s*@const\s+([\w-]+)\s*\{/.exec(line);
    if (constOpenMatch) {
      stack.push(`const:${constOpenMatch[1]}`);
    }

    // เช็คปิดบล็อก => ถ้าชน "}" ก็ pop stack
    if (/\}/.test(line)) {
      // จริง ๆ ต้องระวังหลายกรณี ถ้ามีหลาย "}" ในบรรทัดเดียว
      // แต่ตัวอย่าง DSL ปกติจะมีปีกกาปิดเดียว/บรรทัด
      stack.pop();
    }

    // ดูว่าตอนนี้อยู่ใน class อะไร (ถ้า top ของ stack เป็น class:xxx)
    // คือสcope ของ class ปัจจุบัน (ถ้ามี)
    currentClass = findCurrentClassFromStack(stack);

    // เช็คว่าในบรรทัดมี local variable `--&xxx[...]` หรือไม่
    // (ประกาศหรือใช้งานก็นับว่า "เจอ local var ตัวนี้" อยู่ใน scope ใด)
    // เช่น `--&txABC[red]`
    const localVarRegex = /--\&([\w-]+)\[/g;
    let m: RegExpExecArray | null;
    while ((m = localVarRegex.exec(line)) !== null) {
      const varName = m[1]; // เช่น "tx-test-main-1"

      // ใส่ใน allVars
      localVarInfo.allVars.add(varName);

      // ถ้าอยู่ใน class block => ใส่ลง classVarsMap ด้วย
      if (currentClass) {
        if (!localVarInfo.classVarsMap[currentClass]) {
          localVarInfo.classVarsMap[currentClass] = new Set();
        }
        localVarInfo.classVarsMap[currentClass].add(varName);
      }
    }
  }

  return localVarInfo;
}

/** หา class name ปัจจุบันจาก stack top (ถ้ามี) */
function findCurrentClassFromStack(stack: string[]): string | null {
  // stack top = stack[stack.length - 1]
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.startsWith('class:')) {
      return s.replace('class:', '');
    }
  }
  return null;
}

/**
 * checkIfInsideConstBlock:
 * - ใช้วิธีนับ stack เหมือนกัน
 * - หรือจะ parse ใหม่แบบสั้น ๆ (เหมือน isInsideClassBlock) ก็ได้
 *   (ตัวอย่างใช้ stack-based, แต่เพื่อให้โค้ดง่าย อาจเขียนฟังก์ชันย่อ ๆ)
 */
function checkIfInsideConstBlock(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const upToCursorRange = new vscode.Range(new vscode.Position(0, 0), position);
  const textUpToCursor = document.getText(upToCursorRange);

  let stackCount = 0;
  // จับเปิดบล็อก @const {, กับ "}"
  // simplifed regex => /(@const\s+\w+\s*\{)|(\})/g
  const regex = /(@const\s+[\w-]+\s*\{)|(\})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(textUpToCursor)) !== null) {
    if (match[1]) {
      stackCount++;
    } else if (match[2]) {
      if (stackCount > 0) {
        stackCount--;
      }
    }
  }
  return stackCount > 0;
}

/**
 * getClassNameAtPosition:
 * - ใช้หลักการ stack เหมือนกัน แต่ต้องการเฉพาะ .class block
 * - ถ้าสุดท้าย top ของ stack อยู่ใน class:xxx => return ".xxx"
 * - ถ้าไม่เจอ => return undefined
 */
function getClassNameAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined {
  const upToCursorRange = new vscode.Range(new vscode.Position(0, 0), position);
  const textUpToCursor = document.getText(upToCursorRange);

  const stack: string[] = [];
  // จับ .class {, @const, }
  const regex = /(\.(\w[\w-]*)\s*\{)|(@const\s+[\w-]+\s*\{)|(\})/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(textUpToCursor)) !== null) {
    if (match[1] && match[2]) {
      // .classname
      stack.push(`class:.${match[2]}`);
    } else if (match[3]) {
      // @const something
      stack.push(`const:`);
    } else if (match[4]) {
      // เจอ }
      stack.pop();
    }
  }

  // หา stack จากท้ายไปหา "class:xxx" ตัวล่าสุด
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.startsWith('class:')) {
      return s.replace('class:', '');
    }
  }
  return undefined;
}
