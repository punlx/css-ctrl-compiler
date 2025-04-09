// src/generateCssCommand/parsers/parseSingleAbbr.ts

import { knownStates } from '../constants/knownStates';
import { supportedPseudos } from '../constants/supportedPseudos';
import { IStyleDefinition } from '../types';
import { parseBaseStyle } from './parseBaseStyle';
import { parseContainerStyle } from './parseContainerStyle';
import { parsePseudoElementStyle } from './parsePseudoElementStyle';
import { parseScreenStyle } from './parseScreenStyle';
import { parseStateStyle } from './parseStateStyle';

/**
 * parseSingleAbbr
 * @param abbrLine         ex. "bg[red]" or "hover(bg[red])" or "@query .box2 { ... }"
 * @param styleDef 
 * @param isConstContext   true => in @const or theme.define block
 * @param isQueryBlock     true => we are inside an @query block (=> disallow $variable)
 * @param isDefineContext  true => theme.define
 */
export function parseSingleAbbr(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  isDefineContext: boolean = false
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

  // (ยังคง) ถ้าอยู่ใน @query block => ห้ามประกาศ localVar, ห้ามใช้ $variable
  if (isQueryBlock) {
    // ห้าม "ประกาศ" localVar
    if (/^--&[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Local var not allowed to declare inside @query block. Found: "${trimmed}"`
      );
    }
    // ห้าม $variable
    if (/^\$[\w-]+\[/.test(trimmed)) {
      throw new Error(
        `[CSS-CTRL-ERR] Runtime variable ($var) not allowed inside @query block. Found: "${trimmed}"`
      );
    }
  }

  // ถ้าสไตล์นี้ยังไม่มี hasRuntimeVar แล้วเจอ $var => ติด flag
  if (!styleDef.hasRuntimeVar && /\$[\w-]+\[/.test(trimmed)) {
    styleDef.hasRuntimeVar = true;
  }

  // ถ้ารูปแบบไม่มี "(", ให้ parseBaseStyle 
  const openParenIndex = trimmed.indexOf('(');
  if (openParenIndex === -1) {
    parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  // ถ้าเจอ prefix => เช็กว่าเป็น state/pseudo/screen/container หรือเปล่า
  const prefix = trimmed.slice(0, openParenIndex).trim();

  // state
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
  parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock);
}
