// src/generateCssCommand/utils/handleBindDirectives.ts

import { IParsedDirective, IStyleDefinition } from '../types';

/**
 * handleBindDirectives:
 *   - เช็ค @bind <bindKey> .class1 .class2 ...
 *   - เดิมเคยมีเคส scope=hash => ข้ามการตรวจ แต่ตอนนี้ลบออกแล้ว
 */
export function handleBindDirectives(
  scopeName: string,
  directives: IParsedDirective[],
  classMap: Map<string, IStyleDefinition>
) {
  const localBindKeys = new Set<string>();

  for (const d of directives) {
    if (d.name === 'bind') {
      const tokens = d.value.trim().split(/\s+/);
      if (tokens.length < 2) {
        throw new Error(`[CSS-CTRL-ERR] Invalid @bind syntax: "${d.value}"`);
      }
      const bindKey = tokens[0];
      const classRefs = tokens.slice(1);

      if (localBindKeys.has(bindKey)) {
        throw new Error(`[CSS-CTRL-ERR] @bind key "${bindKey}" is already used in this file.`);
      }
      localBindKeys.add(bindKey);

      for (const ref of classRefs) {
        if (!ref.startsWith('.')) {
          throw new Error(
            `[CSS-CTRL-ERR] @bind usage must reference classes with a dot. got "${ref}"`
          );
        }
        const shortCls = ref.slice(1);

        let finalKey: string;

        // (REMOVED) case "hash" ออก
        if (scopeName === 'none') {
          finalKey = shortCls;
        } else {
          finalKey = `${scopeName}_${shortCls}`;
        }

        // กัน bindKey ชนกับคลาส
        // (เดิมเคยข้ามในกรณี hash; ตอนนี้ลบออก)
        if (classMap.has(`${scopeName}_${bindKey}`)) {
          throw new Error(
            `[CSS-CTRL-ERR] @bind key "${bindKey}" conflicts with existing class ".${bindKey}" in scope="${scopeName}".`
          );
        }

        if (!classMap.has(finalKey)) {
          throw new Error(
            `[CSS-CTRL-ERR] @bind referencing ".${shortCls}" but that class is not defined. (finalKey="${finalKey}")`
          );
        }
      }
    }
  }
}
