import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  globalName: 'GasApi',
  outfile: 'dist/Code.js',
});

await copyFile('src/appsscript.json', 'dist/appsscript.json');
