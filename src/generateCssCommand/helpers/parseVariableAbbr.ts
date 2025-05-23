// src/generateCssCommand/helpers/parseVariableAbbr.ts

export function parseVariableAbbr(abbr: string): { baseVarName: string; suffix: string } {
  if (!abbr.startsWith('$')) {
    throw new Error(`[CSS-CTRL-ERR] Only $variable is supported. Got "${abbr}"`);
  }
  const varNameFull = abbr.slice(1);
  let baseVarName = varNameFull;
  let suffix = '';

  const dashIdx = varNameFull.lastIndexOf('-');
  if (dashIdx > 0) {
    baseVarName = varNameFull.slice(0, dashIdx);
    suffix = varNameFull.slice(dashIdx + 1);
  }
  return { baseVarName, suffix };
}
