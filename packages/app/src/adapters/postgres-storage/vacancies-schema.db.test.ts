import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Kysely, sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.ts';
import { migrateToLatest } from './run-migrations.ts';

// Runs against a real Postgres (pnpm test:db, with DATABASE_URL), in a database of its own that is dropped at the end.
// The schema before the vacancies migration is set up first, so the move of the old resume columns is tested too.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set: database tests need a Postgres to create a test database in');
}

const testName = `markup_test_${randomUUID().replaceAll('-', '')}`;
const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
let admin: Kysely<Database>;
let db: Kysely<Database>;

interface MovedVacancy {
  slug: string;
  company_name: string | null;
  url: string | null;
  status: string;
  deleted: boolean;
}
let moved: MovedVacancy[];
let resumeColumns: string[];

/** A CV with one revision, in the shape before the vacancies migration (it still has the vacancy columns). */
async function insertLegacyResume(
  owner: string,
  slug: string,
  vacancy: { company: string | null; url: string | null; deleted?: boolean },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const resume = randomUUID();
    const revision = randomUUID();
    await sql`
      insert into resumes (id, owner_id, slug, title, company_name, vacancy_url, current_revision_id, deleted_at)
      values (${resume}, ${owner}, ${slug}, ${slug}, ${vacancy.company}, ${vacancy.url}, ${revision},
              ${vacancy.deleted ? sql`now()` : null})
    `.execute(trx);
    await sql`
      insert into resume_revisions (id, resume_id, number, author, kind, html, template_name, template_version)
      values (${revision}, ${resume}, 1, 'claude', 'write', '<p>v1</p>', 'classic', '0.0.4')
    `.execute(trx);
  });
}

/** A CV with one revision in the current schema; returns the ids of both. */
async function insertResume(owner: string, slug: string): Promise<{ resume: string; revision: string }> {
  const resume = randomUUID();
  const revision = randomUUID();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('resumes')
      .values({ id: resume, owner_id: owner, slug, title: slug, current_revision_id: revision })
      .execute();
    await trx
      .insertInto('resume_revisions')
      .values({
        id: revision,
        resume_id: resume,
        number: 1,
        author: 'claude',
        kind: 'write',
        html: '<p>v1</p>',
        template_name: 'classic',
        template_version: '0.0.4',
      })
      .execute();
  });
  return { resume, revision };
}

async function insertUser(name: string): Promise<string> {
  return (await db.insertInto('users').values({ name }).returning('id').executeTakeFirstOrThrow()).id;
}

beforeAll(async () => {
  admin = createDatabase(databaseUrl);
  await sql`create database ${sql.id(testName)}`.execute(admin);
  const url = new URL(databaseUrl);
  url.pathname = `/${testName}`;
  db = createDatabase(url.toString());

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
  });
  const { error } = await migrator.migrateTo('2026-11-03-oauth');
  if (error) {
    throw new Error('Migrating to the schema before vacancies failed', { cause: error });
  }

  const owner = await insertUser('Legacy owner');
  await insertLegacyResume(owner, 'with-both', { company: 'Acme', url: 'https://acme.test/jobs/1' });
  await insertLegacyResume(owner, 'url-only', { company: null, url: 'https://jobs.test/2' });
  await insertLegacyResume(owner, 'in-trash', { company: 'Gone', url: null, deleted: true });
  await insertLegacyResume(owner, 'no-vacancy', { company: null, url: null });

  await migrateToLatest(db);

  moved = (
    await sql<MovedVacancy>`
      select r.slug, v.company_name, v.url, v.status, v.deleted_at is not null as deleted
      from vacancies v join resumes r on r.id = v.resume_id
      order by r.slug
    `.execute(db)
  ).rows;
  resumeColumns = (
    await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'resumes'
    `.execute(db)
  ).rows.map((row) => row.column_name);
});

afterAll(async () => {
  await db.destroy();
  await sql`drop database ${sql.id(testName)}`.execute(admin);
  await admin.destroy();
});

describe('moving the vacancy columns off resumes', () => {
  it('creates a vacancy for each CV that had a company or a vacancy URL', () => {
    expect(moved).toEqual([
      { slug: 'in-trash', company_name: 'Gone', url: null, status: 'saved', deleted: true },
      { slug: 'url-only', company_name: null, url: 'https://jobs.test/2', status: 'saved', deleted: false },
      {
        slug: 'with-both',
        company_name: 'Acme',
        url: 'https://acme.test/jobs/1',
        status: 'saved',
        deleted: false,
      },
    ]);
  });

  it('drops company_name and vacancy_url from resumes', () => {
    expect(resumeColumns).not.toContain('company_name');
    expect(resumeColumns).not.toContain('vacancy_url');
  });
});

describe('vacancies', () => {
  let owner: string;

  beforeEach(async () => {
    await sql`truncate users, resumes, resume_revisions, resume_tags, vacancies, vacancy_tags cascade`.execute(
      db,
    );
    owner = await insertUser('Owner');
  });

  const vacancy = (values: Record<string, unknown> = {}) =>
    db
      .insertInto('vacancies')
      .values({ owner_id: owner, ...values })
      .returning(['id', 'status'])
      .executeTakeFirstOrThrow();

  it('stores a vacancy without a CV or any detail, saved by default', async () => {
    expect((await vacancy()).status).toBe('saved');
  });

  it('links a CV to at most one vacancy', async () => {
    const { resume } = await insertResume(owner, 'senior-angular');
    await vacancy({ resume_id: resume });

    await expect(vacancy({ resume_id: resume })).rejects.toMatchObject({
      constraint: 'vacancies_resume_id_unique',
    });
  });

  it("rejects another user's CV", async () => {
    const stranger = await insertUser('Stranger');
    const { resume } = await insertResume(stranger, 'their-cv');

    await expect(vacancy({ resume_id: resume })).rejects.toMatchObject({
      constraint: 'vacancies_resume_owner_fk',
    });
  });

  it('accepts as the revision sent only a revision of the linked CV', async () => {
    const linked = await insertResume(owner, 'linked');
    const other = await insertResume(owner, 'other');

    await expect(
      vacancy({ resume_id: linked.resume, sent_revision_id: other.revision }),
    ).rejects.toMatchObject({
      constraint: 'vacancies_sent_revision_fk',
    });
    await expect(vacancy({ sent_revision_id: other.revision })).rejects.toMatchObject({
      constraint: 'vacancies_sent_revision_needs_resume',
    });
    await expect(
      vacancy({ resume_id: linked.resume, sent_revision_id: linked.revision }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['a maximum without a minimum', { salary_max: 5000, salary_currency: 'EUR', salary_period: 'month' }],
    [
      'a minimum above the maximum',
      { salary_min: 6000, salary_max: 5000, salary_currency: 'EUR', salary_period: 'month' },
    ],
    ['a negative amount', { salary_min: -1, salary_currency: 'EUR', salary_period: 'month' }],
    ['a lower-case currency', { salary_min: 5000, salary_currency: 'eur', salary_period: 'month' }],
    ['a minimum without a currency', { salary_min: 5000, salary_period: 'month' }],
    ['a minimum without a period', { salary_min: 5000, salary_currency: 'EUR' }],
  ])('rejects a salary with %s', async (_, salary) => {
    await expect(vacancy(salary)).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts a salary rate and a salary range', async () => {
    await expect(
      vacancy({ salary_min: 5000, salary_currency: 'EUR', salary_period: 'month' }),
    ).resolves.toBeDefined();
    await expect(
      vacancy({ salary_min: 60000, salary_max: 80000, salary_currency: 'USD', salary_period: 'year' }),
    ).resolves.toBeDefined();
  });

  it('keeps tags from the shared list and removes them with the vacancy', async () => {
    const { id } = await vacancy({ seniority: 'senior' });
    await db.insertInto('vacancy_tags').values({ vacancy_id: id, tag: 'angular' }).execute();

    await db.deleteFrom('vacancies').where('id', '=', id).execute();

    expect(await db.selectFrom('vacancy_tags').selectAll().execute()).toEqual([]);
  });
});
