import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, CreateResumeInput, WriteRevisionInput } from '../../domain/index.ts';
import { createDatabase, type Database } from './database.ts';
import { migrateToLatest } from './run-migrations.ts';
import { PostgresResumeRepository } from './postgres-resume-repository.ts';

// Runs against a real Postgres (pnpm test:db, with DATABASE_URL). Each run creates its own database, applies the
// migrations and drops it at the end, so the development database is never touched.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set: database tests need a Postgres to create a test database in');
}

const testName = `markup_test_${randomUUID().replaceAll('-', '')}`;
let admin: Kysely<Database>;
let db: Kysely<Database>;
let owner: string;
let repository: PostgresResumeRepository;

/** Test HTML marked as checked: the repository keeps whatever it is given, so these tests skip the boundary. */
const html = (text: string) => `<!doctype html><html><body>${text}</body></html>` as CanonicalResumeHtml;
const template = { name: 'classic', version: '0.0.3' };

const newResume = (slug: string, overrides: Partial<CreateResumeInput> = {}): CreateResumeInput => ({
  slug,
  title: 'Senior Angular',
  html: html('v1'),
  template,
  author: 'claude',
  ...overrides,
});
const newRevision = (
  slug: string,
  text: string,
  overrides: Partial<WriteRevisionInput> = {},
): WriteRevisionInput => ({
  slug,
  title: 'Senior Angular',
  html: html(text),
  template,
  author: 'claude',
  kind: 'write',
  ...overrides,
});

beforeAll(async () => {
  admin = createDatabase(databaseUrl);
  await sql`create database ${sql.id(testName)}`.execute(admin);
  const url = new URL(databaseUrl);
  url.pathname = `/${testName}`;
  db = createDatabase(url.toString());
  await migrateToLatest(db);
});

afterAll(async () => {
  await db.destroy();
  await sql`drop database ${sql.id(testName)}`.execute(admin);
  await admin.destroy();
});

beforeEach(async () => {
  await sql`truncate users, resumes, resume_revisions, resume_tags cascade`.execute(db);
  owner = (await db.insertInto('users').values({ name: 'Owner' }).returning('id').executeTakeFirstOrThrow())
    .id;
  repository = new PostgresResumeRepository(db, owner);
});

describe('PostgresResumeRepository', () => {
  it('creates a CV with its first revision and reads it back', async () => {
    expect(await repository.create(newResume('senior-angular'))).toBe('created');

    expect(await repository.read('senior-angular')).toMatchObject({
      slug: 'senior-angular',
      number: 1,
      current: 1,
      basedOn: null,
      html: html('v1'),
      template,
      author: 'claude',
      kind: 'write',
    });
    expect(await repository.list()).toEqual([
      expect.objectContaining({ slug: 'senior-angular', title: 'Senior Angular', revision: 1 }),
    ]);
  });

  it('keeps a slug taken per owner, also while the CV is in the trash', async () => {
    await repository.create(newResume('senior-angular'));
    expect(await repository.create(newResume('senior-angular'))).toBe('slug-taken');

    await db.updateTable('resumes').set({ deleted_at: new Date() }).execute();
    expect(await repository.create(newResume('senior-angular'))).toBe('slug-taken');

    const other = (
      await db.insertInto('users').values({ name: 'Other' }).returning('id').executeTakeFirstOrThrow()
    ).id;
    expect(await new PostgresResumeRepository(db, other).create(newResume('senior-angular'))).toBe('created');
  });

  it('writes the next revision on top of the current one, and takes the title from it', async () => {
    await repository.create(newResume('senior-angular'));

    expect(await repository.write(newRevision('senior-angular', 'v2', { title: 'Lead Angular' }))).toEqual({
      kind: 'written',
      number: 2,
      basedOn: 1,
      basedOnCurrent: true,
    });
    expect(await repository.read('senior-angular')).toMatchObject({
      number: 2,
      current: 2,
      basedOn: 1,
      html: html('v2'),
    });
    expect((await repository.list())[0]).toMatchObject({ title: 'Lead Angular', revision: 2 });
  });

  it('builds on an older revision when asked, and says the newer ones are left out', async () => {
    await repository.create(newResume('senior-angular'));
    await repository.write(newRevision('senior-angular', 'v2'));
    await repository.write(newRevision('senior-angular', 'v3'));

    expect(
      await repository.write(
        newRevision('senior-angular', 'v1 again', { basedOn: 1, kind: 'restore', author: 'user' }),
      ),
    ).toEqual({ kind: 'written', number: 4, basedOn: 1, basedOnCurrent: false });
    expect(await repository.read('senior-angular')).toMatchObject({
      number: 4,
      basedOn: 1,
      kind: 'restore',
      author: 'user',
    });
    // Nothing is lost: the left-out revisions are still there.
    expect(await repository.read('senior-angular', 3)).toMatchObject({
      number: 3,
      current: 4,
      html: html('v3'),
    });
  });

  it('answers for a missing CV or base revision without writing', async () => {
    await repository.create(newResume('senior-angular'));
    expect(await repository.write(newRevision('missing', 'x'))).toEqual({ kind: 'not-found' });
    expect(await repository.write(newRevision('senior-angular', 'x', { basedOn: 9 }))).toEqual({
      kind: 'unknown-base',
    });
    expect(await repository.read('senior-angular')).toMatchObject({ number: 1 });
    expect(await repository.read('senior-angular', 9)).toBeNull();
  });

  it('lets concurrent writes to one CV take turns, so numbers never clash', async () => {
    await repository.create(newResume('senior-angular'));
    const results = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((text) => repository.write(newRevision('senior-angular', text))),
    );
    const numbers = results.map((result) => (result.kind === 'written' ? result.number : 0)).sort();
    expect(numbers).toEqual([2, 3, 4, 5, 6]);
    expect(await repository.read('senior-angular')).toMatchObject({ number: 6, current: 6 });
  });

  it("does not show another owner's CVs, or CVs in the trash", async () => {
    await repository.create(newResume('mine'));
    await repository.create(newResume('trashed'));
    await db.updateTable('resumes').set({ deleted_at: new Date() }).where('slug', '=', 'trashed').execute();

    const other = (
      await db.insertInto('users').values({ name: 'Other' }).returning('id').executeTakeFirstOrThrow()
    ).id;
    expect(await new PostgresResumeRepository(db, other).list()).toEqual([]);
    expect(await new PostgresResumeRepository(db, other).read('mine')).toBeNull();

    expect((await repository.list()).map((resume) => resume.slug)).toEqual(['mine']);
    expect(await repository.read('trashed')).toBeNull();
    expect(await repository.write(newRevision('trashed', 'x'))).toEqual({ kind: 'not-found' });
  });

  it('lists the most recently changed CVs first', async () => {
    await repository.create(newResume('older'));
    await repository.create(newResume('newer'));
    await repository.write(newRevision('older', 'v2'));
    expect((await repository.list()).map((resume) => resume.slug)).toEqual(['older', 'newer']);
  });
});
