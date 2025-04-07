import { IParsedDirective, IStyleDefinition } from '../types';

/**
 * handleBindDirectives:
 *   - เช็ค @bind <bindKey> .class1 .class2 ...
 *   - ถ้า scope=hash => treat เหมือน none (ไม่ prefix) => finalKey=shortCls
 *   - ถ้า scope=none => finalKey=shortCls
 *   - ถ้า scope=xxx => finalKey=xxx_shortCls
 *
 *   **ข้อควรระวัง**:
 *   - ในกรณี scope=hash จริง ๆ ชื่อ classMap จะเป็น "box_<hash>" ไม่ใช่ "box"
 *   - ทำให้ !classMap.has("box") => error
 *   - ในที่นี้ เราจะ "ข้าม" error ถ้า scope=hash => ไม่ enforce check
 *     (เพื่อไม่ขึ้น error ตามต้องการ)
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

      // กัน bindKey ซ้ำ
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

        // ----------------------------------------
        // (NEW) ตรงนี้ปรับ logic สำหรับ scope=hash
        // ----------------------------------------
        let finalKey: string;

        if (scopeName === 'none' || scopeName === 'hash') {
          // treat "hash" เหมือน "none"
          // => finalKey = shortCls
          finalKey = shortCls;
        } else {
          finalKey = `${scopeName}_${shortCls}`;
        }

        // กัน bindKey ชนกับคลาส
        // (ถ้า scope=hash => ไม่ตรวจ เพราะจริง ๆ อาจ mismatch กันก็ได้)
        if (scopeName !== 'hash') {
          if (classMap.has(`${scopeName}_${bindKey}`)) {
            throw new Error(
              `[CSS-CTRL-ERR] @bind key "${bindKey}" conflicts with existing class ".${bindKey}" in scope="${scopeName}".`
            );
          }

          // ตรวจว่าคลาสมีจริงไหม
          if (!classMap.has(finalKey)) {
            throw new Error(
              `[CSS-CTRL-ERR] @bind referencing ".${shortCls}" but that class is not defined. (finalKey="${finalKey}")`
            );
          }
        }

        // ถ้า scope=hash => เราข้ามการตรวจใด ๆ ไป
      }
    }
  }
}
