// Composition root for `pnpm import:files`: moves the CVs that v1 kept as files into the database, once. Each
// <dir>/cvs/<slug>/document.html is moved to the current "resume" vocabulary (it predates it) and goes through the
// same use case as Claude's create_resume, so it passes the validation boundary and becomes the CV's first revision;
// earlier versions in history/ are left behind. A CV whose slug is already taken is skipped, so running it again
// changes nothing. Prints what happened to each CV.
//   LEGACY_RESUME_DIR  the v1 data directory (default ./data)
//   DATABASE_URL  Postgres connection string (required)
import { templateCatalog } from '@markup-resume/styles';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseHtml } from './adapters/parse5-html-parser/parse-html.ts';
import { connectResumeRepository } from './adapters/postgres-storage/connect-resume-repository.ts';
import { createResumeDocument, ResumeChanges } from './app/index.ts';
import { upgradeLegacyVocabulary } from './domain/index.ts';

const dataDir = resolve(process.env['LEGACY_RESUME_DIR'] ?? 'data');
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}

const legacyDir = join(dataDir, 'cvs');
const entries = await readdir(legacyDir, { withFileTypes: true });
const ids = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const { db, repository } = await connectResumeRepository(databaseUrl);
const dependencies = {
  repository,
  templates: templateCatalog,
  parseHtml,
  resumeChanges: new ResumeChanges(),
};
const counts = { imported: 0, skipped: 0, rejected: 0 };

try {
  for (const slug of ids) {
    let html: string;
    try {
      html = await readFile(join(legacyDir, slug, 'document.html'), 'utf8');
    } catch {
      console.log(`skipped   ${slug}: no document.html`);
      counts.skipped++;
      continue;
    }
    // Canonical first, as the upgrade expects; the use case checks the result like any other document.
    const upgraded = upgradeLegacyVocabulary(parseHtml(html).html);
    const result = await createResumeDocument(dependencies, slug, upgraded, 'system');
    switch (result.kind) {
      case 'created':
        console.log(`imported  ${slug}`);
        counts.imported++;
        break;
      case 'already-exists':
        console.log(`skipped   ${slug}: already in the database`);
        counts.skipped++;
        break;
      case 'invalid-document':
        console.log(
          `rejected  ${slug}:\n${result.problems.map((problem) => `            - ${problem}`).join('\n')}`,
        );
        counts.rejected++;
        break;
      default:
        console.log(`rejected  ${slug}: ${result.kind}`);
        counts.rejected++;
    }
  }
} finally {
  await db.destroy();
}

console.log(
  `\n${counts.imported} imported, ${counts.skipped} skipped, ${counts.rejected} rejected (from ${legacyDir})`,
);
