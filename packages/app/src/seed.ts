// Composition root for `pnpm seed`: puts the classic template's example CV (fictional) into the database, so a
// fresh checkout has something to show. It goes through the same use case as Claude's create_resume, so the
// template's styles are inserted and its markup is checked. Never overwrites a CV.
//   DATABASE_URL  Postgres connection string (required)
import { templateCatalog } from '@markup-resume/styles';
import { parseHtml } from './adapters/parse5-html-parser/parse-html.ts';
import { connectResumeRepository } from './adapters/postgres-storage/connect-resume-repository.ts';
import { createResumeDocument, ResumeChanges } from './app/index.ts';

const SAMPLE_ID = 'sample';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}
const { db, repository } = await connectResumeRepository(databaseUrl);

const [ref] = templateCatalog.refs();
const example = ref ? templateCatalog.guide(ref)?.example : undefined;
if (!example) {
  throw new Error('The style library has no template with an example');
}

try {
  const result = await createResumeDocument(
    { repository, templates: templateCatalog, parseHtml, resumeChanges: new ResumeChanges() },
    SAMPLE_ID,
    example,
    'system',
  );
  switch (result.kind) {
    case 'created':
      console.log(`Seeded "${SAMPLE_ID}" from the ${ref} example`);
      break;
    case 'already-exists':
      console.log(`A CV "${SAMPLE_ID}" is already there, left untouched.`);
      break;
    default:
      throw new Error(`The ${ref} example was rejected: ${JSON.stringify(result)}`);
  }
} finally {
  await db.destroy();
}
