// src/generateCssCommand/parsers/parseSingleAbbr.ts

import { knownStates } from '../constants/knownStates';
import { supportedPseudos } from '../constants/supportedPseudos';
import { IStyleDefinition } from '../types';
import { parseBaseStyle } from './parseBaseStyle';
import { parseContainerStyle } from './parseContainerStyle';
import { parsePseudoElementStyle } from './parsePseudoElementStyle';
import { parseScreenStyle } from './parseScreenStyle';
import { parseStateStyle } from './parseStateStyle';

export function parseSingleAbbr(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  isDefineContext: boolean = false
) {
  const trimmed = abbrLine.trim();

  if (isDefineContext && /^\$[\w-]+\[/.test(trimmed)) {
    throw new Error(
      `[CSS-CTRL-ERR] $variable is not allowed in theme.define block. Found: "${trimmed}"`
    );
  }

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

  const openParenIndex = trimmed.indexOf('(');
  if (openParenIndex === -1) {
    parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock);
    return;
  }

  const prefix = trimmed.slice(0, openParenIndex);
  if (knownStates.includes(prefix)) {
    parseStateStyle(trimmed, styleDef, isConstContext);
    return;
  }
  if (supportedPseudos.includes(prefix)) {
    parsePseudoElementStyle(trimmed, styleDef, isConstContext);
    return;
  }
  if (prefix === 'screen') {
    parseScreenStyle(trimmed, styleDef, isConstContext);
    return;
  }
  if (prefix === 'container') {
    parseContainerStyle(trimmed, styleDef, isConstContext);
    return;
  }

  parseBaseStyle(trimmed, styleDef, isConstContext, isQueryBlock);
}
