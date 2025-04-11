// src/generateCssCommand/utils/sharedScopeUtils.ts

export function makeFinalName(scopeName: string, className: string, body?: string): string {
  if (scopeName === 'none') {
    return className;
  }
  return `${scopeName}_${className}`;
}
