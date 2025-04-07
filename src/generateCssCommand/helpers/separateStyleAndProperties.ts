// src/generateCssCommand/helpers/separateStyleAndProperties.ts

export function separateStyleAndProperties(abbr: string): [string, string] {
  const match = /^([\w\-\$\&]+)\[(.*)\]$/.exec(abbr.trim());
  if (!match) return ['', ''];
  return [match[1], match[2]];
}
