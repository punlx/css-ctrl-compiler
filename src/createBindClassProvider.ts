// src/createBindClassProvider.ts

import * as vscode from 'vscode';
import { parseThemeClassFull } from './parseTheme';

/**
 * createBindClassProvider:
 * - Trigger: เมื่อผู้ใช้พิมพ์ '.' ในไฟล์ .ctrl.ts
 * - เช็คว่าบรรทัดนั้นมี '@bind' ไหม
 * - หารายชื่อคลาสทั้งหมดในไฟล์ (via getAllClasses) + คลาสจาก theme.class({...})
 * - หาคลาสที่บรรทัดนั้นใช้ไปแล้ว (via getUsedClassesInLine)
 * - Suggest เฉพาะคลาสที่ยังไม่ถูกใช้ในบรรทัดนั้น
 * - ถ้าคลาสนั้นมาจาก theme.class => แสดง label เป็น "<cls> (theme)"
 *   แต่เมื่อเลือกแล้วจะได้ "<cls>" ปกติ
 */
export function createBindClassProvider() {
  return vscode.languages.registerCompletionItemProvider(
    [
      { language: 'typescript', scheme: 'file' },
      { language: 'typescriptreact', scheme: 'file' },
    ],
    {
      /**
       * การปรับเป็น async เพราะเราจะต้อง await การค้นหาไฟล์ ctrl.theme.ts
       */
      async provideCompletionItems(document, position) {
        // 1) เฉพาะไฟล์ .ctrl.ts
        if (!document.fileName.endsWith('.ctrl.ts')) {
          return;
        }

        // 2) หา class ทั้งหมดในไฟล์ .ctrl.ts
        const ctrlClasses = getAllClasses(document);

        // 2.1) หา class จาก theme.class({...}) (แบบ async)
        const themeClasses = await getAllThemeClassKeys();
        // แปลงเป็น Set ไว้เช็คว่าเป็นของ theme หรือไม่
        const themeClassSet = new Set(themeClasses);

        // รวมเป็น unique set
        const combinedSet = new Set([...ctrlClasses, ...themeClasses]);
        const allClasses = Array.from(combinedSet);

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

        // (CHANGED) 6.1) หา "current class name" จากตำแหน่ง cursor
        // เช่น ถ้าอยู่ภายใต้ .box { ... } => currentClassName = "box"
        const currentClassName = findCurrentClassName(document, position);

        // 7) Filter เอาเฉพาะคลาสที่ยังไม่ถูกใช้
        // (CHANGED) + ถ้า cls === currentClassName และเป็น local => skip
        const availableClasses = allClasses.filter((cls) => {
          if (usedClasses.has(cls)) {
            return false;
          }
          // skip ถ้าเป็น class ตัวเอง (local)
          if (cls === currentClassName && !themeClassSet.has(cls)) {
            return false;
          }
          return true;
        });

        // 8) สร้าง CompletionItem
        const completions: vscode.CompletionItem[] = [];
        for (const cls of availableClasses) {
          const item = new vscode.CompletionItem(cls, vscode.CompletionItemKind.Class);

          // ถ้ามาจาก theme.class => label = "<cls> (theme)"
          if (themeClassSet.has(cls)) {
            item.label = cls + ' (theme)';
          }

          // เมื่อเลือก -> insertText เป็นชื่อ cls ปกติ
          item.insertText = cls;

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
 * สแกนทั้งไฟล์ document => หา .className {
 * ข้าม class ถ้าบรรทัดประกาศนั้นมี "@query"
 */
function getAllClasses(document: vscode.TextDocument): string[] {
  const text = document.getText();
  const classSet = new Set<string>();

  // จับ .className {
  const regex = /\.([\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const clsName = match[1];

    // --- ค้นหาบรรทัดปัจจุบัน
    const matchIndex = match.index;
    let lineStart = text.lastIndexOf('\n', matchIndex);
    if (lineStart === -1) {
      lineStart = 0;
    }
    let lineEnd = text.indexOf('\n', matchIndex);
    if (lineEnd === -1) {
      lineEnd = text.length;
    }

    const lineContent = text.slice(lineStart, lineEnd);

    // --- ถ้าบรรทัดมี @query => skip
    if (lineContent.includes('@query')) {
      continue;
    }

    classSet.add(clsName);
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

/**
 * (CHANGED) findCurrentClassName:
 *   สแกนย้อนขึ้นไปจากบรรทัด position.line ว่าเราอยู่ใน block ".xxx { ... }" ไหน
 *   ถ้าไม่เจอ => return undefined
 */
function findCurrentClassName(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  let lineNum = position.line;
  while (lineNum >= 0) {
    const lineText = document.lineAt(lineNum).text;
    // เจอ "xxx {" ไหม (ไม่สน pseudo, etc.)
    const m = lineText.match(/^\s*\.(\w+)\s*\{/);
    if (m) {
      return m[1];
    }
    lineNum--;
  }
  return undefined;
}

/**
 * getAllThemeClassKeys:
 * - พยายามหาไฟล์ ctrl.theme.ts ใน workspace
 * - ถ้าเจอ => parseThemeClassFull => ได้ object { box1:"...", box2:"..." }
 * - คืนเป็น array ของ key
 * - ถ้าไม่มีไฟล์ หรือไม่มี theme.class => คืน []
 */
async function getAllThemeClassKeys(): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return [];

  const themeFilePath = await findCtrlThemeFileInWorkspace();
  if (!themeFilePath) {
    return [];
  }

  const classMap = parseThemeClassFull(themeFilePath);
  return Object.keys(classMap);
}

async function findCtrlThemeFileInWorkspace(): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles('**/ctrl.theme.ts', '**/node_modules/**', 1);
  if (files.length > 0) {
    return files[0].fsPath;
  }
  return undefined;
}
