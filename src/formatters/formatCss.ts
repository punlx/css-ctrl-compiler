import * as prettier from 'prettier/standalone';
import * as postcssPlugin from 'prettier/plugins/postcss';

export async function formatCss(css: string): Promise<string> {
  try {
    return await prettier.format(css, {
      parser: 'css',
      plugins: [postcssPlugin],
      semi: true,
      singleQuote: false,
    });
  } catch (err) {
    console.warn('[CSS-CTRL] Prettier formatting failed:', err);
    return css;
  }
}
