import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const spreadsheetId = process.env.SPREADSHEET_ID;

if (!spreadsheetId) {
  throw new Error('SPREADSHEET_ID is required');
}

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  globalName: 'GasApi',
  outfile: 'dist/Code.js',
  define: {
    __SPREADSHEET_ID__: JSON.stringify(spreadsheetId),
  },
});

await copyFile('src/appsscript.json', 'dist/appsscript.json');
