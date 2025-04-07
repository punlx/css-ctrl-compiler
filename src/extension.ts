import * as vscode from 'vscode';
import { createScopeSuggestionProvider } from './scopeSuggestionProvider';

// --- (NEW) import createCssCtrlThemeCssFile ---
import { createCssCtrlThemeCssFile } from './generateCssCommand/createCssCtrlThemeCssCommand';

// import validateCssCtrlDoc.ts ซึ่งไว้ parse-check ใส่ Diagnostic
import { validateCssCtrlDoc } from './generateCssCommand/validateCssCtrlDoc';

// import createCssCtrlCssFile (จากโค้ดข้างบน)
import { createCssCtrlCssFile } from './generateCssCommand/createCssCtrlCssCommand';

// generateGenericProvider (command "ctrl.generateGeneric")
import { generateGenericProvider } from './generateGenericProvider';

/* -------------------------------------------------------------------------
   provider / parseTheme / etc. ...
------------------------------------------------------------------------- */
import {
  parseThemePaletteFull,
  parseThemeBreakpointDict,
  parseThemeTypographyDict,
  parseThemeKeyframeDict,
  parseThemeVariableDict,
  parseThemeDefine,
  // เพิ่มเติม: parseThemeDefineFull (ใช้ดึงสไตล์เต็มๆ)
  parseThemeDefineFull,
} from './parseTheme';

import { createCSSValueSuggestProvider } from './cssValueSuggestProvider';
import { createReversePropertyProvider } from './reversePropertyProvider';
import { updateDecorations } from './ghostTextDecorations';
import { createBreakpointProvider } from './breakpointProvider';
import { createFontProvider } from './typographyProvider';
import { createKeyframeProvider } from './keyframeProvider';
import { createSpacingProvider } from './variableProvider';
import { createBindClassProvider } from './createBindClassProvider';
import { createColorProvider } from './colorProvider';
import { createDirectiveProvider } from './directiveProvider';
import { createCssCtrlSnippetProvider } from './createCssCtrlSnippetProvider';
import { createUseConstProvider } from './createUseConstProvider';
import { createLocalVarProvider } from './localVarProvider';
import { createCssCtrlThemeColorProvider } from './themePaletteColorProvider';
import { createCssTsColorProvider, initPaletteMap } from './cssTsColorProvider';
import { createModeSuggestionProvider } from './modeSuggestionProvider';
import { createQueryPseudoProvider } from './createQueryPseudoProvider';
import { initSpacingMap, updateSpacingDecorations } from './ghostSpacingDecorations';
import { updateImportantDecorations } from './ghostImportantDecorations';
import { createDefineProvider } from './defineProvider';
import { createDefineTopKeyProvider } from './defineTopKeyProvider';

/* ------------------ (NEW) import & use for defineFull parsing ------------------ */
import { globalDefineMap } from './generateCssCommand/createCssCtrlCssCommand';
import { createEmptyStyleDef } from './generateCssCommand/helpers/createEmptyStyleDef';
import { parseSingleAbbr } from './generateCssCommand/parsers/parseSingleAbbr';
export let globalBreakpointDict: Record<string, string> = {};
export let globalTypographyDict: Record<string, string> = {};

export async function activate(context: vscode.ExtensionContext) {
  console.log('Css-CTRL Intellisense is now active!');

  // สร้าง DiagnosticCollection สำหรับ validate
  const cssCtrlDiagnosticCollection = vscode.languages.createDiagnosticCollection('ctrl');
  context.subscriptions.push(cssCtrlDiagnosticCollection);

  // parse theme ...
  await initPaletteMap();
  let paletteColors: Record<string, Record<string, string>> = {};
  let screenDict: Record<string, string> = {};
  let fontDict: Record<string, string> = {};
  let keyframeDict: Record<string, string> = {};
  let spacingDict: Record<string, string> = {};
  let defineMap: Record<string, string[]> = {};

  // (NEW) สำหรับ define แบบ “เต็ม” (raw style string)
  let defineRawMap: Record<string, Record<string, string>> = {};

  if (vscode.workspace.workspaceFolders?.length) {
    try {
      const foundUris = await vscode.workspace.findFiles(
        '**/ctrl.theme.ts',
        '**/node_modules/**',
        1
      );
      if (foundUris.length > 0) {
        const themeFilePath = foundUris[0].fsPath;
        paletteColors = parseThemePaletteFull(themeFilePath);
        screenDict = parseThemeBreakpointDict(themeFilePath);
        fontDict = parseThemeTypographyDict(themeFilePath);
        keyframeDict = parseThemeKeyframeDict(themeFilePath);
        spacingDict = parseThemeVariableDict(themeFilePath);
        defineMap = parseThemeDefine(themeFilePath);

        // (NEW) parse define แบบเต็ม (ดึงสตริงสไตล์)
        defineRawMap = parseThemeDefineFull(themeFilePath);
      }
    } catch (err) {
      console.error('Error parse theme =>', err);
    }
  }

  // register providers ...
  const bracketProvider = createCSSValueSuggestProvider();
  const reversePropProvider = createReversePropertyProvider();
  const colorProvider = createColorProvider(paletteColors);
  const breakpointProvider = createBreakpointProvider(screenDict);
  const fontProvider = createFontProvider(fontDict);
  const keyframeProvider = createKeyframeProvider(keyframeDict);
  const spacingProvider = createSpacingProvider(spacingDict);
  const directiveProvider = createDirectiveProvider();
  const bindClassProvider = createBindClassProvider();
  const ctrlSnippetProvider = createCssCtrlSnippetProvider();
  const useConstProvider = createUseConstProvider();
  const localVarProviderDisposable = createLocalVarProvider();
  const paletteProvider = createCssCtrlThemeColorProvider();
  const cssTsColorProviderDisposable = createCssTsColorProvider();
  const commentModeSuggestionProvider = createModeSuggestionProvider();
  const defineProviderDisposable = createDefineProvider(defineMap);
  const defineTopKeyProviderDisposable = createDefineTopKeyProvider(defineMap);
  const queryPseudoProvider = createQueryPseudoProvider();
  const scopeProvider = createScopeSuggestionProvider();

  context.subscriptions.push(
    scopeProvider,
    localVarProviderDisposable,
    bracketProvider,
    reversePropProvider,
    colorProvider,
    breakpointProvider,
    fontProvider,
    keyframeProvider,
    spacingProvider,
    directiveProvider,
    bindClassProvider,
    ctrlSnippetProvider,
    useConstProvider,
    paletteProvider,
    cssTsColorProviderDisposable,
    commentModeSuggestionProvider,
    defineProviderDisposable,
    defineTopKeyProviderDisposable,
    queryPseudoProvider
  );

  initSpacingMap(spacingDict);

  // ตกแต่ง GhostText / Decorator
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
    updateSpacingDecorations(vscode.window.activeTextEditor);
    updateImportantDecorations(vscode.window.activeTextEditor);
  }
  const changeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
    }
  });
  context.subscriptions.push(changeEditorDisposable);

  const changeDocDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
    }
  });
  context.subscriptions.push(changeDocDisposable);

  // push generateGenericProvider
  context.subscriptions.push(generateGenericProvider);

  // --------------------------------------------------------------------------------
  // (NEW) เชื่อมข้อมูล screenDict, fontDict, defineRawMap => globalDefineMap
  // --------------------------------------------------------------------------------
  globalBreakpointDict = screenDict; // สำหรับ screen(...) / container(...)
  globalTypographyDict = fontDict; // สำหรับ ty[...]
  // แปลง defineRawMap => globalDefineMap
  for (const mainKey in defineRawMap) {
    globalDefineMap[mainKey] = {};
    const subObj = defineRawMap[mainKey];
    for (const subKey in subObj) {
      const rawStyleStr = subObj[subKey];
      const partialDef = createEmptyStyleDef();
      // แตกเป็นบรรทัด => parse ทีละบรรทัด (isConstContext=true, isDefineContext=true)
      const lines = rawStyleStr
        .split(/\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const ln of lines) {
        parseSingleAbbr(ln, partialDef, true, false, true);
      }
      globalDefineMap[mainKey][subKey] = partialDef;
    }
  }

  // --------------------------------------------------------------------------------
  // สแกนไฟล์ .ctrl.ts ทั้งหมด -> validateCssCtrlDoc
  // --------------------------------------------------------------------------------
  const ctrlUris = await vscode.workspace.findFiles('**/*.ctrl.ts', '**/node_modules/**');
  for (const uri of ctrlUris) {
    const doc = await vscode.workspace.openTextDocument(uri);
    validateCssCtrlDoc(doc, cssCtrlDiagnosticCollection);
  }

  // --------------------------------------------------------------------------------
  // เมื่อ save ไฟล์ .ctrl.ts => validate ใหม่ ถ้าไม่ error => generate
  // --------------------------------------------------------------------------------
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
    if (savedDoc.fileName.endsWith('.ctrl.ts')) {
      // validate
      validateCssCtrlDoc(savedDoc, cssCtrlDiagnosticCollection);

      // check ถ้ายังมี error => ไม่ generate
      const diags = cssCtrlDiagnosticCollection.get(savedDoc.uri);
      const hasErr = diags && diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
      if (hasErr) {
        return;
      }

      // ถ้าไม่มี error => createCssCtrlCssFile
      try {
        await createCssCtrlCssFile(savedDoc);
      } catch (err) {
        return;
      }

      // no error => ctrl.generateGeneric
      await vscode.commands.executeCommand('ctrl.generateGeneric');
      // vscode.window.showInformationMessage('Created .ctrl.css and Generated Generic done!');
    }
  });
  context.subscriptions.push(saveDisposable);

  // --------------------------------------------------------------------------------
  // Command สร้างไฟล์ .ctrl.css และ generate
  // --------------------------------------------------------------------------------
  const combinedCommand = vscode.commands.registerCommand(
    'ctrl.createCssCtrlCssAndGenerate',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active text editor');
        return;
      }

      validateCssCtrlDoc(editor.document, cssCtrlDiagnosticCollection);
      const diags = cssCtrlDiagnosticCollection.get(editor.document.uri);
      const hasErr = diags && diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
      if (hasErr) {
        return;
      }

      try {
        await createCssCtrlCssFile(editor.document);
      } catch (err) {
        return;
      }

      await vscode.commands.executeCommand('ctrl.generateGeneric');
    }
  );
  context.subscriptions.push(combinedCommand);

  // --------------------------------------------------------------------------------
  // (NEW) เมื่อ save ไฟล์ ctrl.theme.ts => generate ctrl.theme.css
  // --------------------------------------------------------------------------------
  const themeSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
    if (savedDoc.fileName.endsWith('ctrl.theme.ts')) {
      try {
        // (คุณจะ validate อะไรก่อนก็ได้)
        await createCssCtrlThemeCssFile(savedDoc);
        // vscode.window.showInformationMessage('ctrl.theme.css generated successfully!');
      } catch (error) {
        // handle error
        console.error('Error generating ctrl.theme.css =>', error);
      }
    }
  });
  context.subscriptions.push(themeSaveDisposable);
}

export function deactivate() {
  console.log('CSS-CTRL Compiler is now deactivated.');
}
