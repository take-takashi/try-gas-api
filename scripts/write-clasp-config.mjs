import { writeFile } from 'node:fs/promises';

const scriptId = process.env.CLASP_SCRIPT_ID;

if (!scriptId) {
  throw new Error('CLASP_SCRIPT_ID is required');
}

await writeFile(
  '.clasp.json',
  `${JSON.stringify({ scriptId, rootDir: 'dist' }, null, 2)}\n`,
);
