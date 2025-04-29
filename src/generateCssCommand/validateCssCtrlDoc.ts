// src/generateCssCommand/validateCssCtrlDoc.ts

import * as vscode from 'vscode';

// สมมติเรามีฟังก์ชัน parse/generate ที่ไม่มี Side Effect ชื่อ generateCssCtrlCssFromSource
// คุณอาจจะดึงมาจาก createCssCtrlCssCommand.ts หรือสร้างเวอร์ชัน noSideEffect แยกก็ได้
// ในที่นี้จะอ้างถึงจากไฟล์เดียวกัน (ลิงก์แบบ relative)
import { generateCssCtrlCssFromSource } from './createCssCtrlCssCommand';

// validateCssCtrlDoc: ตรวจสอบไฟล์ .ctrl.ts เพื่อดูว่ามี error ตอน parse หรือไม่
// - ถ้ามี error => ใส่ Diagnostic
// - ถ้าไม่มี => ลบ Diagnostic
// (CHANGED) ปรับเป็น async เพื่อ await generateCssCtrlCssFromSource
export async function validateCssCtrlDoc(
  doc: vscode.TextDocument,
  diagCollection: vscode.DiagnosticCollection
) {
  diagCollection.delete(doc.uri);

  try {
    const sourceText = doc.getText();
    // (CHANGED) ใส่ await เพราะ generateCssCtrlCssFromSource เป็น async
    await generateCssCtrlCssFromSource(sourceText);

  } catch (err: any) {
    const diag: vscode.Diagnostic = {
      message: err.message,
      severity: vscode.DiagnosticSeverity.Error,
      source: 'CSS-CTRL Validate',
      range: new vscode.Range(0, 0, 0, 0),
    };
    diagCollection.set(doc.uri, [diag]);
  }
}
