// src/generateCssCommand/parsers/parsePluginContainerStyle.ts

import { IStyleDefinition } from '../types';
import { abbrMap } from '../constants/abbrMap';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { globalTypographyDict } from '../../extension';
import { pluginContainerConfig } from '../constants/pluginContainerConfig';
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';

// ADDED for theme.property
import { globalDefineMap } from '../createCssCtrlCssCommand';

/**
 * parsePluginContainerStyle
 * ใช้ parse syntax เช่น "drawer-container($bg[red] ty[title])"
 */
export function parsePluginContainerStyle(
  abbrLine: string,
  styleDef: IStyleDefinition,
  isConstContext: boolean = false,
  isQueryBlock: boolean = false,
  keyframeNameMap?: Map<string, string>
): void {
  // แยกฟังก์ชัน กับเนื้อในวงเล็บ
  const openParenIdx = abbrLine.indexOf('(');
  const closeParenIdx = abbrLine.lastIndexOf(')');
  if (openParenIdx === -1 || closeParenIdx === -1) {
    throw new Error(`[CSS-CTRL] parsePluginContainerStyle: missing "(" or ")" => "${abbrLine}"`);
  }

  const funcName = abbrLine.slice(0, openParenIdx).trim();
  const bracketContent = abbrLine.slice(openParenIdx + 1, closeParenIdx).trim();

  // ดึงชื่อ class container จาก config
  const containerClass = pluginContainerConfig[funcName];
  if (!containerClass) {
    throw new Error(`[CSS-CTRL] pluginContainerConfig not found for "${funcName}".`);
  }

  // ถ้าขึ้นต้นด้วย ":drawer-container" หรือ "&:drawer-container" => error
  if (funcName.startsWith(':') || funcName.startsWith('&:')) {
    throw new Error(`[CSS-CTRL] plugin container cannot be used as pseudo => "${funcName}"`);
  }

  // เตรียมโครงสร้างเก็บ props
  if (!styleDef.pluginContainers) {
    styleDef.pluginContainers = [];
  }
  // หา object เดิม ถ้ายังไม่มีค่อย push ใหม่
  let pcObj = styleDef.pluginContainers.find((c) => c.containerName === containerClass);
  if (!pcObj) {
    pcObj = {
      containerName: containerClass,
      props: {},
    };
    styleDef.pluginContainers.push(pcObj);
  }

  // เตรียม varContainers ถ้าจะมี $var
  if (!styleDef.varContainers) {
    styleDef.varContainers = {};
  }
  if (!styleDef.varContainers[containerClass]) {
    styleDef.varContainers[containerClass] = {};
  }

  // ถ้าไม่มีเนื้อในวงเล็บ => จบ
  if (!bracketContent) {
    return;
  }

  // split token ด้วยช่องว่าง
  const tokens = bracketContent.split(/ (?=[^\[\]]*(?:\[|$))/);

  for (const tk of tokens) {
    const { line: tokenNoBang, isImportant } = detectImportantSuffix(tk);

    if (isConstContext && isImportant) {
      throw new Error(`[CSS-CTRL-ERR] !important is not allowed in @const block. Found: "${tk}"`);
    }

    // ห้ามใช้ $var ใน @query block
    if (isQueryBlock && tokenNoBang.startsWith('$')) {
      throw new Error(
        `[CSS-CTRL-ERR] $variable not allowed inside @query for plugin container. Found: "${tk}"`
      );
    }

    const [abbr, val] = separateStyleAndProperties(tokenNoBang);
    if (!abbr) continue;

    // ty[...] ?
    if (abbr === 'ty') {
      const typKey = val.trim();
      if (!globalTypographyDict[typKey]) {
        throw new Error(
          `[CSS-CTRL-ERR] Typography key "${typKey}" not found in theme.typography(...) (pluginContainer).`
        );
      }
      const styleStr = globalTypographyDict[typKey];
      const subTokens = styleStr.split(/\s+/);
      for (const subT of subTokens) {
        const { line: subNoBang, isImportant: subImp } = detectImportantSuffix(subT);
        const [subAbbr, subVal] = separateStyleAndProperties(subNoBang);
        if (!subAbbr) continue;

        const cProp = abbrMap[subAbbr as keyof typeof abbrMap];
        if (!cProp) {
          throw new Error(
            `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (pluginContainer ty[${typKey}])`
          );
        }
        const finalVal = convertCSSVariable(subVal) + (subImp ? ' !important' : '');
        if (Array.isArray(cProp)) {
          for (const propName of cProp) {
            pcObj.props[propName] = finalVal;
          }
        } else {
          pcObj.props[cProp] = finalVal;
        }
      }
      continue;
    }

    // (NEW) plain local var => "--xxx"
    if (abbr.startsWith('--') && !abbr.startsWith('--&')) {
      const rawName = abbr.slice(2);
      if (!rawName) {
        throw new Error(`[CSS-CTRL-ERR] Missing local var name after "--". Found: "${abbrLine}"`);
      }
      // ใส่ลง plainLocalVars ของ styleDef
      if (!(styleDef as any).plainLocalVars) {
        (styleDef as any).plainLocalVars = {};
      }
      (styleDef as any).plainLocalVars[`--${rawName}`] = convertCSSVariable(val);
      continue;
    }

    // ตรวจว่าเป็น $var หรือไม่
    let isVar = false;
    let realAbbr = abbr;
    if (abbr.startsWith('$')) {
      isVar = true;
      realAbbr = abbr.slice(1);
      if (realAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }
    }

    // lookup ใน abbrMap
    const def = abbrMap[realAbbr as keyof typeof abbrMap];
    if (!def) {
      // ADDED for theme.property fallback
      if (realAbbr in globalDefineMap) {
        const subKey = val.trim();
        if (!globalDefineMap[realAbbr][subKey]) {
          throw new Error(
            `[CSS-CTRL-ERR] "${realAbbr}[${subKey}]" not found in theme.property(...) (pluginContainer).`
          );
        }
        const partialDef = globalDefineMap[realAbbr][subKey];
        // นำ partialDef.base => ใส่ใน pcObj.props
        for (const k in partialDef.base) {
          pcObj.props[k] = partialDef.base[k] + (isImportant ? ' !important' : '');
        }
        continue;
      } else {
        throw new Error(
          `[CSS-CTRL-ERR] "${realAbbr}" not found in abbrMap (pluginContainer).`
        );
      }
    }

    let finalVal = convertCSSVariable(val) + (isImportant ? ' !important' : '');

    if (val.includes('--&')) {
      finalVal = val.replace(/--&([\w-]+)/g, (_, varName) => {
        return `LOCALVAR(${varName})`;
      });
      finalVal += isImportant ? ' !important' : '';
    }

    if (isVar) {
      // เช่น $bg[red]
      styleDef.varContainers[containerClass][realAbbr] = convertCSSVariable(val);
      const varRef = `var(--${realAbbr}-${containerClass})` + (isImportant ? ' !important' : '');
      if (Array.isArray(def)) {
        for (const propName of def) {
          pcObj.props[propName] = varRef;
        }
      } else {
        pcObj.props[def] = varRef;
      }
    } else {
      if (Array.isArray(def)) {
        for (const propName of def) {
          pcObj.props[propName] = finalVal;
        }
      } else {
        pcObj.props[def] = finalVal;
      }
    }
  }
}
