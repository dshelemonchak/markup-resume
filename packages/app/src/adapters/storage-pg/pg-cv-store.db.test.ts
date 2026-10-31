import { randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CanonicalCvHtml, NewCv, NewRevision } from '../../domain/index.ts';
import { createDatabase, type Database } from './database.ts';
import { migrateToLatest } from './migration.ts';
import { PgCvStore } from './pg-cv-store.ts';

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
let store: PgCvStore;

/** Test HTML marked as checked: the store keeps whatever it is given, so these tests skip the boundary. */
const html = (text: string) => `<!doctype html><html><body>${text}</body></html>` as CanonicalCvHtml;
const template = { name: 'classic', version: '0.0.2' };

const newCv = (slug: string, overrides: Partial<NewCv> = {}): NewCv => ({
  slug,
  title: 'Senior Angular',
  html: html('v1'),
  template,
  author: 'claude',
  ...overrides,
});
const newRevision = (slug: string, text: string, overrides: Partial<NewRevision> = {}): NewRevision => ({
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
  await sql`truncate users, cvs, revisions, cv_tags cascade`.execute(db);
  owner = (await db.insertInto('users').values({ name: 'Owner' }).returning('id').executeTakeFirstOrThrow())
    .id;
  store = new PgCvStore(db, owner);
});

describe('PgCvStore', () => {
  it('creates a CV with its first revision and reads it back', async () => {
    expect(await store.create(newCv('senior-angular'))).toBe('created');

    expect(await store.read('senior-angular')).toMatchObject({
      slug: 'senior-angular',
      number: 1,
      current: 1,
      basedOn: null,
      html: html('v1'),
      template,
      author: 'claude',
      kind: 'write',
    });
    expect(await store.list()).toEqual([
      expect.objectContaining({ slug: 'senior-angular', title: 'Senior Angular', revision: 1 }),
    ]);
  });

  it('keeps a slug taken per owner, also while the CV is in the trash', async () => {
    await store.create(newCv('senior-angular'));
    expect(await store.create(newCv('senior-angular'))).toBe('slug-taken');

    await db.updateTable('cvs').set({ deleted_at: new Date() }).execute();
    expect(await store.create(newCv('senior-angular'))).toBe('slug-taken');

    const other = (
      await db.insertInto('users').values({ name: 'Other' }).returning('id').executeTakeFirstOrThrow()
    ).id;
    expect(await new PgCvStore(db, other).create(newCv('senior-angular'))).toBe('created');
  });

  it('writes the next revision on top of the current one, and takes the title from it', async () => {
    await store.create(newCv('senior-angular'));

    expect(await store.write(newRevision('senior-angular', 'v2', { title: 'Lead Angular' }))).toEqual({
      kind: 'written',
      number: 2,
      basedOn: 1,
      basedOnCurrent: true,
    });
    expect(await store.read('senior-angular')).toMatchObject({
      number: 2,
      current: 2,
      basedOn: 1,
      html: html('v2'),
    });
    expect((await store.list())[0]).toMatchObject({ title: 'Lead Angular', revision: 2 });
  });

  it('builds on an older revision when asked, and says the newer ones are left out', async () => {
    await store.create(newCv('senior-angular'));
    await store.write(newRevision('senior-angular', 'v2'));
    await store.write(newRevision('senior-angular', 'v3'));

    expect(
      await store.write(
        newRevision('senior-angular', 'v1 again', { basedOn: 1, kind: 'restore', author: 'user' }),
      ),
    ).toEqual({ kind: 'written', number: 4, basedOn: 1, basedOnCurrent: false });
    expect(await store.read('senior-angular')).toMatchObject({
      number: 4,
      basedOn: 1,
      kind: 'restore',
      author: 'user',
    });
    // Nothing is lost: the left-out revisions are still there.
    expect(await store.read('senior-angular', 3)).toMatchObject({ number: 3, current: 4, html: html('v3') });
  });

  it('answers for a missing CV or base revision without writing', async () => {
    await store.create(newCv('senior-angular'));
    expect(await store.write(newRevision('missing', 'x'))).toEqual({ kind: 'not-found' });
    expect(await store.write(newRevision('senior-angular', 'x', { basedOn: 9 }))).toEqual({
      kind: 'unknown-base',
    });
    expect(await store.read('senior-angular')).toMatchObject({ number: 1 });
    expect(await store.read('senior-angular', 9)).toBeNull();
  });

  it('lets concurrent writes to one CV take turns, so numbers never clash', async () => {
    await store.create(newCv('senior-angular'));
    const results = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((text) => store.write(newRevision('senior-angular', text))),
    );
    const numbers = results.map((result) => (result.kind === 'written' ? result.number : 0)).sort();
    expect(numbers).toEqual([2, 3, 4, 5, 6]);
    expect(await store.read('senior-angular')).toMatchObject({ number: 6, current: 6 });
  });

  it("does not show another owner's CVs, or CVs in the trash", async () => {
    await store.create(newCv('mine'));
    await store.create(newCv('trashed'));
    await db.updateTable('cvs').set({ deleted_at: new Date() }).where('slug', '=', 'trashed').execute();

    const other = (
      await db.insertInto('users').values({ name: 'Other' }).returning('id').executeTakeFirstOrThrow()
    ).id;
    expect(await new PgCvStore(db, other).list()).toEqual([]);
    expect(await new PgCvStore(db, other).read('mine')).toBeNull();

    expect((await store.list()).map((cv) => cv.slug)).toEqual(['mine']);
    expect(await store.read('trashed')).toBeNull();
    expect(await store.write(newRevision('trashed', 'x'))).toEqual({ kind: 'not-found' });
  });

  it('lists the most recently changed CVs first', async () => {
    await store.create(newCv('older'));
    await store.create(newCv('newer'));
    await store.write(newRevision('older', 'v2'));
    expect((await store.list()).map((cv) => cv.slug)).toEqual(['older', 'newer']);
  });
});
