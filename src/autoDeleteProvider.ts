// src/autoDeleteProvider.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * createCssCtrlAutoDeleteProvider:
 * - สร้าง FileSystemWatcher เพื่อจับไฟล์ .ctrl.ts
 * - เมื่อมีการลบไฟล์ .ctrl.ts => ลบไฟล์ .ctrl.css ที่ชื่อเดียวกัน
 */
export function createCssCtrlAutoDeleteProvider(context: vscode.ExtensionContext) {
  // สร้าง watcher สำหรับไฟล์ .ctrl.ts
  const ctrlTsWatcher = vscode.workspace.createFileSystemWatcher('**/*.ctrl.ts');

  // เมื่อไฟล์ .ctrl.ts ถูกลบ
  ctrlTsWatcher.onDidDelete((uri) => {
    // uri.fsPath = path เต็มของไฟล์ .ctrl.ts ที่ถูกลบ
    // แปลงเป็น path ของไฟล์ .ctrl.css (ชื่อเดียวกัน)
    const cssPath = uri.fsPath.replace(/\.ctrl\.ts$/, '.ctrl.css');

    // ถ้าไฟล์ .ctrl.css มีอยู่ => ลบ
    if (fs.existsSync(cssPath)) {
      try {
        fs.unlinkSync(cssPath);
        console.log(`Deleted related CSS file: ${cssPath}`);
      } catch (err) {
        console.error(`Failed to delete related CSS file: ${cssPath}`, err);
      }
    }
  });

  // ให้ ExtensionContext จัดการปิด watcher เมื่อ extension ถูก deactivate
  context.subscriptions.push(ctrlTsWatcher);
}
