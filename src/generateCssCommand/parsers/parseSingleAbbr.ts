// src/generateCssCommand/parsers/parseSingleAbbr.ts

import { knownStates } from '../constants/knownStates';
import { supportedPseudos } from '../constants/supportedPseudos';
import { IStyleDefinition } from '../types';
import { parseBaseStyle } from './parseBaseStyle';
import { parseContainerStyle } from './parseContainerStyle';
import { parsePseudoElementStyle } from './parsePseudoElementStyle';
import { parseScreenStyle } from './parseScreenStyle';
import { parseStateStyle } from './parseStateStyle';

// (NEW) import parsePluginStateStyle
import { parsePluginStateStyle } from './parsePluginStateStyle';

// (NEW) import pluginStatesConfig
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

/**
 * parseSingleAbbr
 * @param abbrLine         ex. "bg[red]" or "hover(bg[red])" or "@query .box { ... }"
 * @param styleDef
 * @param isConstContext   true => in @const or theme.define block
 * @param isQueryBlock     true => we are inside an @query block (=> disallow $variable)
 * @param isDefineContext  true => theme.define
 * @param keyframeNameMap  (NEW) สำหรับ rename keyframe (move => app_move)
 */
export function parseSingleAbbr(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  isDefineContext: boolean = false,
  keyframeNameMap?: Map<string, string>
) {
  const trimmed = abbrLine.trim();

  // ไม่อนุญาต $var ใน define block
  if (isDefineContext && /^\$[\w-]+\[/.test(trimmed)) {
    throw new Error(
      `[CSS-CTRL-ERR] $variable is not allowed in theme.define block. Found: "${trimmed}"`
    );
  }

  // ไม่อนุญาต @query ใน @const/@define
  if (isConstContext && trimmed.startsWith('@query')) {
    throw new Error(
      `[CSS-CTRL-ERR] @query is not allowed in @const or theme.define() block. Found: "${trimmed}"`
    );
  }

  // ถ้าอยู่ใน @query block => ห้ามประกาศ localVar, ห้ามใช้ $variable
  if (isQueryBlock) {
    if (/^--&[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Local var not allowed to declare inside @query block. Found: "${trimmed}"`
      );
    }
    if (/^\$[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${trimmed}"`
      );
    }
  }

  // ถ้ายังไม่มี hasRuntimeVar แล้วเจอ $var => ติด flag
  if (!styleDef.hasRuntimeVar && /\$[\w-]+\[/.test(trimmed)) {
    styleDef.hasRuntimeVar = true;
  }

  // ถ้ารูปแบบไม่มี "(" => parseBaseStyle
  const openParenIndex = trimmed.indexOf('(');
  if (openParenIndex === -1) {
    parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock, keyframeNameMap);
    return;
  }

  // (NEW) เช็ค pluginState ผ่าน pluginStatesConfig แทน regex
  // 1) แยก prefix: funcName = substring ก่อน '('
  // 2) split ด้วย "-"
  const funcName = trimmed.slice(0, openParenIndex).trim(); // e.g. "option-active"
  const dashPos = funcName.indexOf('-');
  if (dashPos > 0) {
    // prefixSuffix
    const pluginPrefix = funcName.slice(0, dashPos);
    const pluginSuffix = funcName.slice(dashPos + 1);
    if (
      pluginPrefix &&
      pluginSuffix &&
      pluginStatesConfig[pluginPrefix] &&
      pluginStatesConfig[pluginPrefix][pluginSuffix]
    ) {
      // => เป็น pluginState
      parsePluginStateStyle(trimmed, styleDef, isConstContext, isQueryBlock, keyframeNameMap);
      return;
    }
  }

  // state
  const prefix = funcName; // ex. "hover", "focus", etc.
  if (knownStates.includes(prefix)) {
    parseStateStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  // pseudo
  if (supportedPseudos.includes(prefix)) {
    parsePseudoElementStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  // screen
  if (prefix === 'screen') {
    parseScreenStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  // container
  if (prefix === 'container') {
    parseContainerStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  // ไม่เข้าเคสไหน -> parseBaseStyle
  parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock, keyframeNameMap);
}
