// src/autoDeleteProvider.ts
import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * createCssCtrlAutoDeleteProvider:
 * - สร้าง FileSystemWatcher เพื่อจับไฟล์ .ctrl.ts และ ctrl.theme.ts
 * - เมื่อมีการลบไฟล์ .ctrl.ts => ลบไฟล์ .ctrl.css
 * - เมื่อมีการลบไฟล์ ctrl.theme.ts => ลบไฟล์ ctrl.theme.css
 */
export function createCssCtrlAutoDeleteProvider(context: vscode.ExtensionContext) {
  // สร้าง watcher สำหรับไฟล์ .ctrl.ts และ ctrl.theme.ts
  // ใช้ glob pattern แบบ {} เพื่อจับได้หลายรูปแบบในคราวเดียว
  const watcher = vscode.workspace.createFileSystemWatcher('**/{*.ctrl.ts,ctrl.theme.ts}');

  // เมื่อไฟล์ใด ๆ ใน pattern ถูกลบ
  watcher.onDidDelete((uri) => {
    // ตัวอย่าง: uri.fsPath อาจเป็น:
    //   - /path/to/somefile.ctrl.ts
    //   - /path/to/ctrl.theme.ts
    const filePath = uri.fsPath;

    if (filePath.endsWith('.ctrl.ts')) {
      // ถ้าเป็นไฟล์ .ctrl.ts => ลบ .ctrl.css
      const cssPath = filePath.replace(/\.ctrl\.ts$/, '.ctrl.css');
      deleteIfExist(cssPath);
    } else if (filePath.endsWith('ctrl.theme.ts')) {
      // ถ้าเป็นไฟล์ ctrl.theme.ts => ลบ ctrl.theme.css
      // หรือจะใช้ replace ก็ได้ เช่น
      // const cssPath = filePath.replace(/ctrl\.theme\.ts$/, 'ctrl.theme.css');
      // แต่เนื่องจากชื่อไฟล์ตรงตัว จึงเขียนตรง ๆ ก็ได้
      const cssPath = filePath.replace(/\.ts$/, '.css');
      deleteIfExist(cssPath);
    }
  });

  context.subscriptions.push(watcher);
}

// ฟังก์ชันช่วยลบไฟล์ถ้ามีอยู่
function deleteIfExist(filePath: string) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted related CSS file: ${filePath}`);
    } catch (err) {
      console.error(`Failed to delete related CSS file: ${filePath}`, err);
    }
  }
}
