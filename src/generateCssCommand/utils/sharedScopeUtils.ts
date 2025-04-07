// src/sharedScopeUtils.ts
// หรือจะวางไว้ในที่ๆ สะดวก ทั้ง extension และ runtime import ได้

/************************************************************
 * 1) ฟังก์ชัน generateClassId (hash)
 *    (ถ้าอยู่ในไฟล์เดิมของคุณแล้ว ก็ย้ายมาได้)
 ************************************************************/
function getAlphabeticChar(code: number): string {
  return String.fromCharCode(code < 26 ? code + 97 : code + 39);
}

function hashString(str: string): number {
  let h = 2929;
  for (let i = str.length - 1; i >= 0; i--) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

function generateClassId(str: string): string {
  const code = hashString(str);
  const AD_REPLACER_R = /(a)(d)/gi;
  const CHARS_LENGTH = 52;

  let name = '';
  let x = code;
  while (x > CHARS_LENGTH) {
    const remainder = x % CHARS_LENGTH;
    name = getAlphabeticChar(remainder) + name;
    x = (x / CHARS_LENGTH) | 0;
  }
  name = getAlphabeticChar(x % CHARS_LENGTH) + name;
  return name.replace(AD_REPLACER_R, '$1-$2');
}

/************************************************************
 * 2) makeFinalName(scope, className, body?)
 *    - ถ้า scope='none' => return className
 *    - ถ้า scope='hash' => return className + '_' + hash(...)
 *    - else => scope + '_' + className
 ************************************************************/
export function makeFinalName(scopeName: string, className: string, body?: string): string {
  if (scopeName === 'none') {
    return className;
  } else if (scopeName === 'hash') {
    const trimmed = (body || '').replace(/\s+/g, '');
    const hashedPart = generateClassId(className + trimmed);
    return `${className}_${hashedPart}`;
  } else {
    return `${scopeName}_${className}`;
  }
}
