// src/generateCssCommand/utils/handleBindDirectives.ts

import { IParsedDirective, IStyleDefinition } from '../types';

/**
 * handleBindDirectives:
 *   - เช็ค @bind <bindKey> .class1 .class2 ...
 *   - เพิ่มเงื่อนไข:
 *     1) ถ้าคลาสชื่อซ้ำใน .ctrl.ts และ theme.class(...) => throw error
 *     2) ถ้าไม่พบคลาสในทั้งสอง => throw error
 */
export function handleBindDirectives(
  scopeName: string,
  directives: IParsedDirective[],
  classMap: Map<string, IStyleDefinition>,
  themeClassSet: Set<string> // ไม่มี default
) {
  /**
   * (CHANGED) no longer used. do nothing.
   */
  // const localBindKeys = new Set<string>();
  // for (const d of directives) {
  //   if (d.name === 'bind') {
  //     const tokens = d.value.trim().split(/\s+/);
  //     if (tokens.length < 2) {
  //       throw new Error(`[CSS-CTRL-ERR] Invalid @bind syntax: "${d.value}"`);
  //     }
  //     const bindKey = tokens[0];
  //     const classRefs = tokens.slice(1);
  //     if (localBindKeys.has(bindKey)) {
  //       throw new Error(`[CSS-CTRL-ERR] @bind key "${bindKey}" is already used in this file.`);
  //     }
  //     localBindKeys.add(bindKey);
  //     for (const ref of classRefs) {
  //       if (!ref.startsWith('.')) {
  //         throw new Error(
  //           `[CSS-CTRL-ERR] @bind usage must reference classes with a dot. got "${ref}"`
  //         );
  //       }
  //       const shortCls = ref.slice(1);
  //       let finalKey: string;
  //       if (scopeName === 'none') {
  //         finalKey = shortCls;
  //       } else {
  //         finalKey = `${scopeName}_${shortCls}`;
  //       }
  //       // กัน bindKey ชนกับคลาส
  //       if (classMap.has(`${scopeName}_${bindKey}`)) {
  //         throw new Error(
  //           `[CSS-CTRL-ERR] @bind key "${bindKey}" conflicts with existing class ".${bindKey}" in scope="${scopeName}".`
  //         );
  //       }
  //       // เช็คว่าอยู่ใน ctrl.ts หรือใน theme.class
  //       const isLocal = classMap.has(finalKey);
  //       const isTheme = themeClassSet.has(shortCls);
  //       // (1) ถ้ามีทั้งสอง => conflict
  //       if (isLocal && isTheme) {
  //         throw new Error(
  //           `[CSS-CTRL-ERR] Conflict: class ".${shortCls}" is declared in both .ctrl.ts and theme.class(...)`
  //         );
  //       }
  //       // (2) ถ้าไม่มีเลย => ก็ error
  //       if (!isLocal && !isTheme) {
  //         throw new Error(
  //           `[CSS-CTRL-ERR] No class named ".${shortCls}" found in either .ctrl.ts or theme.class(...)`
  //         );
  //       }
  //     }
  //   }
  // }
}
