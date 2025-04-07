// createBindClassProvider.ts
import * as vscode from 'vscode';

/**
 * createBindClassProvider:
 * - Trigger: เมื่อผู้ใช้พิมพ์ '.' ในไฟล์ .ctrl.ts
 * - เช็คว่าบรรทัดนั้นมี '@bind' ไหม
 * - หารายชื่อคลาสทั้งหมดในไฟล์ (via getAllClasses)
 * - หาคลาสที่บรรทัดนั้นใช้ไปแล้ว (via getUsedClassesInLine)
 * - Suggest เฉพาะคลาสที่ยังไม่ถูกใช้ในบรรทัดนั้น
 */
export function createBindClassProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      provideCompletionItems(document, position) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) หา class ทั้งหมดในไฟล์
        const allClasses = getAllClasses(document);

        // 3) อ่านข้อความในบรรทัด และข้อความก่อน cursor
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // 4) เช็คว่าบรรทัดนี้มี '@bind' หรือไม่
        if (!lineText.includes('@bind')) {
          return;
        }

        // 5) เช็คว่าตำแหน่ง cursor ลงท้ายด้วย '.' หรือไม่
        //    (สมมุติว่าอยากให้ Suggest ตอนพิมพ์ '.' พอดี)
        if (!textBeforeCursor.trim().endsWith('.')) {
          return;
        }

        // 6) หา class ที่ใช้ในบรรทัดนี้ไปแล้ว
        const usedClasses = getUsedClassesInLine(lineText);

        // 7) Filter เอาเฉพาะคลาสที่ยังไม่ถูกใช้
        const availableClasses = allClasses.filter((cls) => !usedClasses.has(cls));

        // 8) สร้าง CompletionItem
        const completions: vscode.CompletionItem[] = [];
        for (const cls of availableClasses) {
          const item = new vscode.CompletionItem(cls, vscode.CompletionItemKind.Class);
          // Insert เป็น "box1" หรือ "box2" ไม่ต้องใส่จุดนำหน้า เพราะ user พิมพ์ไปแล้ว
          item.insertText = cls;
          // อาจกำหนด detail / documentation เพิ่มได้
          completions.push(item);
        }

        return completions;
      },
    },
    '.' // trigger character
  );
}

/**
 * getAllClasses:
 * สแกนทั้งไฟล์ document => หา .className { ... }
 * คืนเป็น array ของชื่อคลาส (เช่น ["box1","box2","box3"])
 */
function getAllClasses(document: vscode.TextDocument): string[] {
  const text = document.getText();
  const classSet = new Set<string>();

  // จับ .box1 { หรือ .box-anything {
  const regex = /\.([\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    classSet.add(match[1]);
  }

  return Array.from(classSet);
}

/**
 * getUsedClassesInLine:
 * - รับ text ของบรรทัดเดียว
 * - หาว่ามี .class อะไรในบรรทัดนั้นบ้าง
 * - คืน set เช่น { "box1","box3" }
 */
function getUsedClassesInLine(lineText: string): Set<string> {
  const used = new Set<string>();
  const regex = /\.([\w-]+)/g; // จับ .box1, .box2
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    used.add(match[1]);
  }
  return used;
}
