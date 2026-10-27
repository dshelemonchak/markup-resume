// Puts the fictional example CV into the data directory, so a fresh checkout has something to show.
// Never overwrites an existing CV.   pnpm seed
import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const EXAMPLE = resolve(import.meta.dirname, '../../../../../examples/sample-cv.html');
const SAMPLE_ID = 'sample';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const target = join(dataDir, 'cvs', SAMPLE_ID, 'document.html');

await mkdir(join(dataDir, 'cvs', SAMPLE_ID), { recursive: true });
try {
  await copyFile(EXAMPLE, target, constants.COPYFILE_EXCL);
  console.log(`Seeded ${target}`);
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    console.log(`Already there, left untouched: ${target}`);
  } else {
    throw error;
  }
}
