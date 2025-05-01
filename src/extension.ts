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
import { updateQueryDecorations, registerAutoInsertSpaceWhenGt } from './ghostQueryDecorations';

/* ------------------ (NEW) import for autoDeleteProvider ------------------ */
import { createCssCtrlAutoDeleteProvider } from './autoDeleteProvider';

/* ------------------ (NEW) import ghostBindDecorations ------------------ */
import { updateBindDecorations } from './ghostBindDecorations';

/* ------------------ (NEW) import ghostThemePropertyDecorations ------------------ */
import {
  initThemePropertyMap,
  updateThemePropertyDecorations,
} from './ghostThemePropertyDecorations';

export let globalBreakpointDict: Record<string, string> = {};
export let globalTypographyDict: Record<string, string> = {};

export async function activate(context: vscode.ExtensionContext) {
  console.log('Css-CTRL Intellisense is now active!');

  const cssCtrlDiagnosticCollection = vscode.languages.createDiagnosticCollection('ctrl');
  context.subscriptions.push(cssCtrlDiagnosticCollection);

  await initPaletteMap();
  let paletteColors: Record<string, Record<string, string>> = {};
  let screenDict: Record<string, string> = {};
  let typographyDict: Record<string, string> = {};
  let keyframeDict: Record<string, string> = {};
  let spacingDict: Record<string, string> = {};
  let defineMap: Record<string, string[]> = {};
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
    queryPseudoProvider,
    queryScopeProvider,
    borderStyleProvider
  );

  initSpacingMap(spacingDict);

  /* (NEW) เรียก initThemePropertyMap เพื่อเตรียม dict defineMap ไว้ใช้กับ ghost theme property */
  initThemePropertyMap(defineMap);

  // อัปเดต ghost text ต่าง ๆ
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
    updateSpacingDecorations(vscode.window.activeTextEditor);
    updateImportantDecorations(vscode.window.activeTextEditor);
    updateQueryDecorations(vscode.window.activeTextEditor);
    registerAutoInsertSpaceWhenGt(context);
    updateBindDecorations(vscode.window.activeTextEditor);
    /* (NEW) updateThemePropertyDecorations */
    updateThemePropertyDecorations(vscode.window.activeTextEditor);
  }

  const changeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
      updateQueryDecorations(editor);
      updateBindDecorations(editor);
      /* (NEW) updateThemePropertyDecorations */
      updateThemePropertyDecorations(editor);
    }
  });
  context.subscriptions.push(changeEditorDisposable);

  const changeDocDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor);
      updateSpacingDecorations(editor);
      updateImportantDecorations(editor);
      updateQueryDecorations(editor);
      updateBindDecorations(editor);
      /* (NEW) updateThemePropertyDecorations */
      updateThemePropertyDecorations(editor);
    }
  });
  context.subscriptions.push(changeDocDisposable);

  context.subscriptions.push(generateGenericProvider);

  globalBreakpointDict = screenDict;
  globalTypographyDict = typographyDict;

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

  // (NEW) createCssCtrlAutoDeleteProvider(context)
  createCssCtrlAutoDeleteProvider(context);
}

export function deactivate() {
  console.log('CSS-CTRL Compiler is now deactivated.');
}
