import * as vscode from 'vscode';
import { createScopeSuggestionProvider } from './scopeSuggestionProvider';
import { createCssCtrlThemeCssFile } from './generateCssCommand/createCssCtrlThemeCssCommand';
import { validateCssCtrlDoc } from './generateCssCommand/validateCssCtrlDoc';
import { createCssCtrlCssFile } from './generateCssCommand/createCssCtrlCssCommand';
import { generateGenericProvider } from './generateGenericProvider';
import {
  parseThemePaletteFull,
  parseThemeBreakpointDict,
  parseThemeTypographyDict,
  parseThemeKeyframeDict,
  parseThemeVariableDict,
  parseThemeDefine,
  parseThemeDefineFull,
} from './parseTheme';
import { createQueryScopeSuggestionProvider } from './queryScopeSuggestionProvider';
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
import { createBorderStyleProvider } from './createBorderStyleProvider';

/* ------------------ (NEW) import ghostQueryDecorations ------------------ */
import {
  updateGhostDecorations,
  registerAutoInsertSpaceWhenBracket,
} from './ghostQueryDecorations';

/* ------------------ (NEW) import for autoDeleteProvider ------------------ */
import { createCssCtrlAutoDeleteProvider } from './autoDeleteProvider';

/* ------------------ (NEW) import ghostBindDecorations ------------------ */
import { updateBindDecorations } from './ghostBindDecorations';

/* ------------------ (NEW) import ghostThemePropertyDecorations ------------------ */
import {
  initThemePropertyMap,
  updateThemePropertyDecorations,
} from './ghostThemePropertyDecorations';

/* ------------------ (NEW) import ghostKeyframeDecorations ------------------ */
import { initThemeKeyframeNames, updateKeyframeDecorations } from './ghostKeyframeDecorations';

export let globalBreakpointDict: Record<string, string> = {};
export let globalTypographyDict: Record<string, string> = {};

export async function activate(context: vscode.ExtensionContext) {
  console.log('Css-CTRL Intellisense is now active!');

  // สร้าง DiagnosticCollection สำหรับไว้เก็บ diagnostic
  const cssCtrlDiagnosticCollection = vscode.languages.createDiagnosticCollection('ctrl');
  context.subscriptions.push(cssCtrlDiagnosticCollection);

  // เตรียมข้อมูล theme เช่น palette
  await initPaletteMap();
  let paletteColors: Record<string, Record<string, string>> = {};
  let screenDict: Record<string, string> = {};
  let typographyDict: Record<string, string> = {};
  let keyframeDict: Record<string, string> = {};
  let spacingDict: Record<string, string> = {};
  let defineMap: Record<string, string[]> = {};
  let defineRawMap: Record<string, Record<string, string>> = {};

  // (NEW) เรียก registerAutoInsertSpaceWhenBracket(context) ตั้งแต่ต้น
  registerAutoInsertSpaceWhenBracket(context);

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
        typographyDict = parseThemeTypographyDict(themeFilePath);
        keyframeDict = parseThemeKeyframeDict(themeFilePath);
        spacingDict = parseThemeVariableDict(themeFilePath);
        defineMap = parseThemeDefine(themeFilePath);
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
  const typographyProvider = createFontProvider(typographyDict);
  const keyframeProviderDisposable = createKeyframeProvider(keyframeDict);
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
  const queryScopeProvider = createQueryScopeSuggestionProvider();
  const borderStyleProvider = createBorderStyleProvider();

  context.subscriptions.push(
    scopeProvider,
    localVarProviderDisposable,
    bracketProvider,
    reversePropProvider,
    colorProvider,
    breakpointProvider,
    typographyProvider,
    keyframeProviderDisposable,
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
    queryPseudoProvider,
    queryScopeProvider,
    borderStyleProvider
  );

  // สำหรับ spacing ghost
  initSpacingMap(spacingDict);

  // (NEW) init define map สำหรับ ghost theme property
  initThemePropertyMap(defineMap);

  // (NEW) init keyframe names
  initThemeKeyframeNames(Object.keys(keyframeDict));

  // อัปเดต ghost text ต่าง ๆ หากมี active editor ตอนเปิด extension
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
    updateSpacingDecorations(vscode.window.activeTextEditor);
    updateImportantDecorations(vscode.window.activeTextEditor);
    updateGhostDecorations(vscode.window.activeTextEditor);
    updateBindDecorations(vscode.window.activeTextEditor);
    updateThemePropertyDecorations(vscode.window.activeTextEditor);
    updateKeyframeDecorations(vscode.window.activeTextEditor);
    // (note) registerAutoInsertSpaceWhenBracket(context) เรียกไปแล้วก่อนหน้า
  }

  // เมื่อเปลี่ยน active text editor ให้ update decorations
  const changeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
      updateGhostDecorations(editor);
      updateBindDecorations(editor);
      updateThemePropertyDecorations(editor);
      updateKeyframeDecorations(editor);
    }
  });
  context.subscriptions.push(changeEditorDisposable);

  // เมื่อมีการแก้ไขเอกสาร (onDidChangeTextDocument) ก็ update ghost text
  const changeDocDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
      updateGhostDecorations(editor);
      updateBindDecorations(editor);
      updateThemePropertyDecorations(editor);
      updateKeyframeDecorations(editor);
    }
  });
  context.subscriptions.push(changeDocDisposable);

  // register generateGenericProvider
  context.subscriptions.push(generateGenericProvider);

  globalBreakpointDict = screenDict;
  globalTypographyDict = typographyDict;

  // เตรียม globalDefineMap เอาไว้
  for (const mainKey in defineRawMap) {
    globalDefineMap[mainKey] = {};
    const subObj = defineRawMap[mainKey];
    for (const subKey in subObj) {
      const rawStyleStr = subObj[subKey];
      const partialDef = createEmptyStyleDef();
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

  // สแกนไฟล์ .ctrl.ts ทั้งหมด -> validateCssCtrlDoc
  const ctrlUris = await vscode.workspace.findFiles('**/*.ctrl.ts', '**/node_modules/**');
  for (const uri of ctrlUris) {
    const doc = await vscode.workspace.openTextDocument(uri);
    validateCssCtrlDoc(doc, cssCtrlDiagnosticCollection);
  }

  // เมื่อ save ไฟล์ .ctrl.ts => validate + generate
  const willSaveDisposable = vscode.workspace.onWillSaveTextDocument((e) => {
    const savedDoc = e.document;
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.toString() !== savedDoc.uri.toString()) {
      return;
    }
    if (savedDoc.fileName.endsWith('.ctrl.ts')) {
      e.waitUntil(
        (async () => {
          validateCssCtrlDoc(savedDoc, cssCtrlDiagnosticCollection);
          const diags = cssCtrlDiagnosticCollection.get(savedDoc.uri);
          const hasErr = diags && diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
          if (hasErr) {
            return;
          }
          try {
            await createCssCtrlCssFile(savedDoc);
          } catch (err) {
            return;
          }
          await vscode.commands.executeCommand('ctrl.generateGeneric');
        })()
      );
    }
  });
  context.subscriptions.push(willSaveDisposable);

  // สร้าง command สำหรับให้ user เรียกด้วยตัวเอง -> createCssCtrlCss และ generate
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

  // เมื่อ save ไฟล์ ctrl.theme.ts => generate ctrl.theme.css
  const themeWillSaveDisposable = vscode.workspace.onWillSaveTextDocument((e) => {
    const savedDoc = e.document;
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor || activeEditor.document.uri.toString() !== savedDoc.uri.toString()) {
      return;
    }

    if (savedDoc.fileName.endsWith('ctrl.theme.ts')) {
      e.waitUntil(
        (async () => {
          try {
            await createCssCtrlThemeCssFile(savedDoc, cssCtrlDiagnosticCollection);
          } catch (error) {
            return;
          }
          const diags = cssCtrlDiagnosticCollection.get(savedDoc.uri);
          const hasErr = diags && diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
          if (hasErr) {
            return;
          }
        })()
      );
    }
  });
  context.subscriptions.push(themeWillSaveDisposable);

  // (NEW) createCssCtrlAutoDeleteProvider(context) => auto-delete some code if needed
  createCssCtrlAutoDeleteProvider(context);
}

export function deactivate() {
  console.log('CSS-CTRL Compiler is now deactivated.');
}
