export function ensureScopeUnique(scopeName: string) {
  if (scopeName === 'none') return;
  // ถ้าอยากกันซ้ำ cross-file ก็จัดเก็บลง set หรือ map ตรงนี้
  // if (usedScopes.has(scopeName)) {
  //   throw new Error(`[CSS-CTRL-ERR] scope "${scopeName}" was already used in another file.`);
  // }
  // usedScopes.add(scopeName);
}
