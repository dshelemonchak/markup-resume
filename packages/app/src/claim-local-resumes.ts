// Composition root for `pnpm claim:local-resumes`: once, after your first sign-in, moves the CVs that versions
// before sign-in kept for a local owner (a user without a sign-in identity) to you, and removes the local owner
// (ADR-0027). Nothing moves when you already have a CV with one of their slugs; it says which.
//   DATABASE_URL     Postgres connection string (required)
//   OWNER_GITHUB_ID  who gets the CVs: a GitHub user id that has signed in once (required)
import { claimLocalResumes } from './adapters/postgres-storage/claim-local-resumes.ts';
import { connectDatabase } from './adapters/postgres-storage/connect-database.ts';
import { requireOwner } from './owner.ts';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}
const db = await connectDatabase(databaseUrl);

try {
  const owner = await requireOwner(db);
  const result = await claimLocalResumes(db, owner.id);
  switch (result.kind) {
    case 'claimed':
      console.log(`Moved ${result.resumes} CVs to ${owner.name ?? owner.id} and removed the local owner.`);
      break;
    case 'nothing-to-claim':
      console.log('There is no local owner: nothing to move.');
      break;
    case 'slug-conflicts':
      console.log(
        `Nothing moved: you already have CVs with these slugs: ${result.slugs.join(', ')}. ` +
          'Delete or rename yours, then run this again.',
      );
      process.exitCode = 1;
      break;
  }
} finally {
  await db.destroy();
}
