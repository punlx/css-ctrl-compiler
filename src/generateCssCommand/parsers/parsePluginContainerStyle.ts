// src/generateCssCommand/parsers/parsePluginContainerStyle.ts

import { IStyleDefinition } from '../types';
import { abbrMap } from '../constants/abbrMap';
import { convertCSSVariable } from '../helpers/convertCSSVariable';
import { detectImportantSuffix } from '../helpers/detectImportantSuffix';
import { separateStyleAndProperties } from '../helpers/separateStyleAndProperties';
import { globalTypographyDict } from '../../extension';
import { pluginContainerConfig } from '../constants/pluginContainerConfig';
import { createEmptyStyleDef } from '../helpers/createEmptyStyleDef';

/**
 * parsePluginContainerStyle
 * ใช้ parse syntax เช่น "drawer-container($bg[red] ty[title])"
 * แล้วเก็บผลลง styleDef.pluginContainers[].props
 * ถ้าเจอ $var => ถ้า isQueryBlock => throw error
 * ถ้าเจอ --&var => เก็บให้ transformLocalVariables ทีหลัง
 * ถ้าเจอ ty[...] => ดึงจาก globalTypographyDict
 * ฯลฯ
 *
 * @param abbrLine เช่น "drawer-container(bg[red])" หรือ "dialog-container($color[blue])"
 * @param styleDef
 * @param isConstContext
 * @param isQueryBlock
 * @param keyframeNameMap
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

  // ถ้าไม่มีเนื้อในวงเล็บ => จบ (แปลว่าไม่มี property)
  if (!bracketContent) {
    return;
  }

  // split token ด้วยช่องว่าง แต่ระวังการตัด [ ... ]
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

        const def = abbrMap[subAbbr as keyof typeof abbrMap];
        if (!def) {
          throw new Error(
            `[CSS-CTRL-ERR] "${subAbbr}" not found in abbrMap (pluginContainer ty[${typKey}])`
          );
        }
        const finalVal = convertCSSVariable(subVal) + (subImp ? ' !important' : '');
        if (Array.isArray(def)) {
          for (const propName of def) {
            pcObj.props[propName] = finalVal;
          }
        } else {
          pcObj.props[def] = finalVal;
        }
      }
      continue;
    }

    // (NEW) plain local var => "--xxx"
    if (abbr.startsWith('--') && !abbr.startsWith('--&')) {
      // e.g. --color[red]
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
      // ถ้า realAbbr === 'ty' => error (ห้าม $ty)
      if (realAbbr === 'ty') {
        throw new Error(
          `[CSS-CTRL-ERR] "$ty[...]": cannot use runtime variable to reference typography.`
        );
      }
    }

    // lookup ใน abbrMap
    const def = abbrMap[realAbbr as keyof typeof abbrMap];
    if (!def) {
      throw new Error(`[CSS-CTRL-ERR] "${realAbbr}" not found in abbrMap (pluginContainer).`);
    }

    let finalVal = convertCSSVariable(val) + (isImportant ? ' !important' : '');

    // ถ้าพบ --&xxx ใน val => local var usage
    if (val.includes('--&')) {
      finalVal = val.replace(/--&([\w-]+)/g, (_, varName) => {
        return `LOCALVAR(${varName})`;
      });
      finalVal += isImportant ? ' !important' : '';
    }

    if (isVar) {
      // เช่น $bg[red]
      // เก็บใน varContainers[containerClass][realAbbr] = <rawValue>
      styleDef.varContainers[containerClass][realAbbr] = convertCSSVariable(val);
      // แล้วใส่ prop => var(--xxx-containerClass)
      const varRef = `var(--${realAbbr}-${containerClass})` + (isImportant ? ' !important' : '');
      if (Array.isArray(def)) {
        for (const propName of def) {
          pcObj.props[propName] = varRef;
        }
      } else {
        pcObj.props[def] = varRef;
      }
    } else {
      // เคสปกติ (ไม่ใช่ $var)
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
