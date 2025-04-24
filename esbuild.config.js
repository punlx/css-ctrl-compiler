// esbuild.config.js
require('esbuild')
  .build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    platform: 'node',
    format: 'cjs',
    target: ['node14'],
    external: ['vscode'], // สำคัญ! อย่า bundle vscode API
    minify: true,
  })
  .catch(() => process.exit(1));
