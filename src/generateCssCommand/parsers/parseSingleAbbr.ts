// src/generateCssCommand/parsers/parseSingleAbbr.ts

import { knownStates } from '../constants/knownStates';
import { supportedPseudos } from '../constants/supportedPseudos';
import { IStyleDefinition } from '../types';
import { parseBaseStyle } from './parseBaseStyle';
import { parseContainerStyle } from './parseContainerStyle';
import { parsePseudoElementStyle } from './parsePseudoElementStyle';
import { parseScreenStyle } from './parseScreenStyle';
import { parseStateStyle } from './parseStateStyle';
import { parsePluginStateStyle } from './parsePluginStateStyle';
import { pluginStatesConfig } from '../constants/pluginStatesConfig';

// (MODIFIED) import pluginContainerConfig + parsePluginContainerStyle
import { pluginContainerConfig } from '../constants/pluginContainerConfig';
import { parsePluginContainerStyle } from './parsePluginContainerStyle';

/**
 * parseSingleAbbr
 * @param abbrLine         ex. "bg[red]" หรือ "hover(bg[red])" หรือ "> .child { ... }"
 * @param styleDef
 * @param isConstContext   true => กำลัง parse ใน @const หรือ theme.property block
 * @param isQueryBlock     true => อยู่ใน @query block => จะมีข้อจำกัด (ห้าม $var, ห้ามประกาศ local var)
 * @param isDefineContext  true => theme.property(...)
 * @param keyframeNameMap  (ใช้ rename keyframe)
 * @param isParentBlock    (NEW) => ถ้าเป็น parent block => ข้อจำกัดเหมือน query block
 */
export function parseSingleAbbr(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  isDefineContext: boolean = false,
  keyframeNameMap?: Map<string, string>,
  isParentBlock: boolean = false
) {
  const trimmed = abbrLine.trim();

  // -----------------------------------------------
  // (A) เช็ค !important restrictions หรืออื่น ๆ ใน @const / theme.property
  //     เช่น $var / @query
  // -----------------------------------------------

  // ไม่อนุญาต $var ใน property block
  if (isDefineContext && /^\$[\w-]+\[/.test(trimmed)) {
    throw new Error(
      `[CSS-CTRL-ERR] $variable is not allowed in theme.property block. Found: "${trimmed}"`
    );
  }

  // ไม่อนุญาตให้ใช้ @query ใน @const
  if (isConstContext && trimmed.startsWith('@query')) {
    throw new Error(
      `[CSS-CTRL-ERR] @query is not allowed in @const or theme.property() block. Found: "${trimmed}"`
    );
  }

  // (NEW) เช็คการใช้ '>' หรือ '<' ภายใน @const
  //     สมมติเราถือว่า ถ้าพบรูปแบบ "> .xxx" หรือ "< .xxx" ในบรรทัด => ไม่อนุญาต
  //     (ปรับ regex ได้ตามต้องการ)
  if (isConstContext) {
    // ตัวอย่างเช็คง่าย ๆ ว่าเจอ '>' หรือ '<' ตามด้วยช่องว่าง + '.' + ตัวอักษร
    if (/(^|\s|\r|\n)[><]\s*\.[\w-]/.test(' ' + trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Nested block ('>' or '<') not allowed inside @const. Found: "${trimmed}"`
      );
    }
  }

  // รวมเงื่อนไขบล็อคแบบ restrict => isQueryBlock || isParentBlock
  const isRestrictedBlock = isQueryBlock || isParentBlock;

  // ถ้าอยู่ใน restrictedBlock => ห้ามประกาศ localVar (--&xxx) หรือ $var
  if (isRestrictedBlock) {
    // เช็ค localVar declaration "--&..."
    if (/^--&[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Local var not allowed to declare inside @query or <block. Found: "${trimmed}"`
      );
    }
    // เช็ค $var
    if (/^\$[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query or <block. Found: "${trimmed}"`
      );
    }
  }

  // ถ้ายังไม่มี hasRuntimeVar แล้วเจอ $var => ติด flag
  if (!styleDef.hasRuntimeVar && /\$[\w-]+\[/.test(trimmed)) {
    styleDef.hasRuntimeVar = true;
  }

  // -----------------------------------------------------
  // (B) แยกกรณีมี '(' => อาจเป็น state/pseudo/container/screen ฯลฯ
  // -----------------------------------------------------
  const openParenIndex = trimmed.indexOf('(');
  if (openParenIndex === -1) {
    parseBaseStyle(trimmed, styleDef, isConstContext, isRestrictedBlock, keyframeNameMap);
    return;
  }

  // เช็ค pluginState (prefix-suffix) => "option-active", "accordion-expanded", ฯลฯ
  const funcName = trimmed.slice(0, openParenIndex).trim();
  const dashPos = funcName.indexOf('-');
  if (dashPos > 0) {
    const pluginPrefix = funcName.slice(0, dashPos);
    const pluginSuffix = funcName.slice(dashPos + 1);
    if (
      pluginPrefix &&
      pluginSuffix &&
      pluginStatesConfig[pluginPrefix] &&
      pluginStatesConfig[pluginPrefix][pluginSuffix]
    ) {
      parsePluginStateStyle(trimmed, styleDef, isConstContext, isRestrictedBlock, keyframeNameMap);
      return;
    }
  }

  // pluginContainer ?
  if (pluginContainerConfig.hasOwnProperty(funcName)) {
    parsePluginContainerStyle(
      trimmed,
      styleDef,
      isConstContext,
      isRestrictedBlock,
      keyframeNameMap
    );
    return;
  }

  // state (hover, focus, active, ...)
  const prefix = funcName;
  if (knownStates.includes(prefix)) {
    parseStateStyle(trimmed, styleDef, isConstContext, isRestrictedBlock);
    return;
  }

  // pseudo (before, after, placeholder, ...)
  if (supportedPseudos.includes(prefix)) {
    parsePseudoElementStyle(trimmed, styleDef, isConstContext, isRestrictedBlock);
    return;
  }

  // screen(...)
  if (prefix === 'screen') {
    parseScreenStyle(trimmed, styleDef, isConstContext, isRestrictedBlock);
    return;
  }

  // container(...)
  if (prefix === 'container') {
    parseContainerStyle(trimmed, styleDef, isConstContext, isRestrictedBlock);
    return;
  }

  // fallback => parseBaseStyle
  parseBaseStyle(trimmed, styleDef, isConstContext, isRestrictedBlock, keyframeNameMap);
}
