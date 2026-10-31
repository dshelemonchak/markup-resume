// Composition root for `pnpm import:files`: moves the CVs that v1 kept as files into the database, once. Each
// <dir>/cvs/<id>/document.html goes through the same use case as Claude's create_cv, so it passes the validation
// boundary and becomes the CV's first revision; earlier versions in history/ are left behind. A CV whose slug is
// already taken is skipped, so running it again changes nothing. Prints what happened to each CV.
//   CV_DATA_DIR   the v1 data directory (default ./data)
//   DATABASE_URL  Postgres connection string (required)
import { templateCatalog } from '@markup-resume/styles';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseMarkup } from './adapters/html-parse5/parse-markup.ts';
import { openCvStore } from './adapters/storage-pg/open-cv-store.ts';
import { createCvDocument, CvChanges } from './app/index.ts';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}

const cvsDir = join(dataDir, 'cvs');
const entries = await readdir(cvsDir, { withFileTypes: true });
const ids = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const { db, store } = await openCvStore(databaseUrl);
const services = { store, templates: templateCatalog, parseMarkup, cvChanges: new CvChanges() };
const counts = { imported: 0, skipped: 0, rejected: 0 };

try {
  for (const id of ids) {
    let html: string;
    try {
      html = await readFile(join(cvsDir, id, 'document.html'), 'utf8');
    } catch {
      console.log(`skipped   ${id}: no document.html`);
      counts.skipped++;
      continue;
    }
    const result = await createCvDocument(services, id, html, 'system');
    switch (result.kind) {
      case 'created':
        console.log(`imported  ${id}`);
        counts.imported++;
        break;
      case 'already-exists':
        console.log(`skipped   ${id}: already in the database`);
        counts.skipped++;
        break;
      case 'invalid-document':
        console.log(
          `rejected  ${id}:\n${result.problems.map((problem) => `            - ${problem}`).join('\n')}`,
        );
        counts.rejected++;
        break;
      default:
        console.log(`rejected  ${id}: ${result.kind}`);
        counts.rejected++;
    }
  }
} finally {
  await db.destroy();
}

console.log(
  `\n${counts.imported} imported, ${counts.skipped} skipped, ${counts.rejected} rejected (from ${cvsDir})`,
);
