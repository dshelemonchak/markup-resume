import { createHash, randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, ExternalIdentity } from '../../domain/index.ts';
import { claimLocalResumes } from './claim-local-resumes.ts';
import { createDatabase, type Database } from './database.ts';
import { PostgresResumeRepository } from './postgres-resume-repository.ts';
import { PostgresSessionRepository } from './postgres-session-repository.ts';
import { PostgresUserRepository } from './postgres-user-repository.ts';
import { migrateToLatest } from './run-migrations.ts';

// Runs against a real Postgres (pnpm test:db, with DATABASE_URL), in a database of its own, like the resume
// repository's tests.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set: database tests need a Postgres to create a test database in');
}

const testName = `markup_test_${randomUUID().replaceAll('-', '')}`;
let admin: Kysely<Database>;
let db: Kysely<Database>;
let users: PostgresUserRepository;
let sessions: PostgresSessionRepository;

const DAY = 24 * 60 * 60 * 1000;
const ALEX: ExternalIdentity = {
  provider: 'github',
  providerUserId: '42',
  name: 'Alex',
  email: 'alex@example.com',
};
const hash = (token: string) => createHash('sha256').update(token).digest();

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
  await sql`truncate users, user_identities, sessions, resumes, resume_revisions, resume_tags cascade`.execute(
    db,
  );
  users = new PostgresUserRepository(db);
  sessions = new PostgresSessionRepository(db);
});

async function createAlex() {
  const created = await users.createWithIdentity(ALEX);
  if (created.kind !== 'created') {
    throw new Error('Alex was not created');
  }
  return created.user;
}

describe('PostgresUserRepository', () => {
  it('creates a user with their identity, and finds them by provider and id only', async () => {
    expect(await users.findByIdentity(ALEX)).toBeNull();
    const alex = await createAlex();
    expect(alex.name).toBe('Alex');
    expect(await users.findByIdentity({ provider: 'github', providerUserId: '42' })).toEqual(alex);
    expect(await users.findByIdentity({ provider: 'google', providerUserId: '42' })).toBeNull();
  });

  it('reports an identity that is taken, and leaves no half-created user behind', async () => {
    await createAlex();
    expect(await users.createWithIdentity({ ...ALEX, name: 'Other' })).toEqual({ kind: 'identity-taken' });
    expect(await db.selectFrom('users').select('name').execute()).toEqual([{ name: 'Alex' }]);
  });

  it('lets only one of two concurrent first sign-ins create the user', async () => {
    const results = await Promise.all([users.createWithIdentity(ALEX), users.createWithIdentity(ALEX)]);
    expect(results.map((result) => result.kind).sort()).toEqual(['created', 'identity-taken']);
    expect(await db.selectFrom('users').select('id').execute()).toHaveLength(1);
  });
});

describe('PostgresSessionRepository', () => {
  it('finds a session by its token hash, with its user, and stores only the hash', async () => {
    const alex = await createAlex();
    const now = new Date();
    await sessions.create({
      userId: alex.id,
      tokenHash: hash('token'),
      expiresAt: new Date(now.getTime() + DAY),
    });

    const found = await sessions.findActive(hash('token'), { now, idleSince: new Date(now.getTime() - DAY) });
    expect(found?.user).toEqual(alex);
    expect(found?.lastSeenAt).toBeInstanceOf(Date);
    expect(await sessions.findActive(hash('other'), { now, idleSince: new Date(0) })).toBeNull();
    const stored = await db.selectFrom('sessions').select('token_hash').executeTakeFirstOrThrow();
    expect(stored.token_hash).toEqual(hash('token'));
  });

  it('finds no session that has expired, or that was last seen before the idle limit', async () => {
    const alex = await createAlex();
    const now = new Date();
    await sessions.create({
      userId: alex.id,
      tokenHash: hash('token'),
      expiresAt: new Date(now.getTime() + DAY),
    });

    expect(
      await sessions.findActive(hash('token'), {
        now: new Date(now.getTime() + DAY),
        idleSince: new Date(0),
      }),
    ).toBeNull();
    expect(
      await sessions.findActive(hash('token'), { now, idleSince: new Date(now.getTime() + 60_000) }),
    ).toBeNull();
  });

  it('records activity, ends a session, and ends every session of a deleted user', async () => {
    const alex = await createAlex();
    const now = new Date();
    const at = { now, idleSince: new Date(0) };
    for (const token of ['one', 'two']) {
      await sessions.create({
        userId: alex.id,
        tokenHash: hash(token),
        expiresAt: new Date(now.getTime() + DAY),
      });
    }

    const later = new Date(now.getTime() + 60_000);
    await sessions.touch((await sessions.findActive(hash('one'), at))!.id, later);
    expect((await sessions.findActive(hash('one'), at))!.lastSeenAt).toEqual(later);

    await sessions.delete(hash('one'));
    expect(await sessions.findActive(hash('one'), at)).toBeNull();
    expect(await sessions.findActive(hash('two'), at)).not.toBeNull();

    await db.deleteFrom('users').where('id', '=', alex.id).execute();
    expect(await db.selectFrom('sessions').select('id').execute()).toEqual([]);
  });

  it('deletes sessions that expired, or were last seen, before the given moments', async () => {
    const alex = await createAlex();
    const now = new Date();
    for (const [token, expiresAt] of [
      ['expired', new Date(now.getTime() - 2 * DAY)],
      ['idle', new Date(now.getTime() + DAY)],
      ['active', new Date(now.getTime() + DAY)],
    ] as const) {
      await sessions.create({ userId: alex.id, tokenHash: hash(token), expiresAt });
    }
    await db
      .updateTable('sessions')
      .set({ last_seen_at: new Date(now.getTime() - 3 * DAY) })
      .where('token_hash', '=', hash('idle'))
      .execute();

    expect(
      await sessions.deleteEnded({
        expiredBefore: new Date(now.getTime() - DAY),
        idleBefore: new Date(now.getTime() - 2 * DAY),
      }),
    ).toBe(2);
    expect(await sessions.findActive(hash('active'), { now, idleSince: new Date(0) })).not.toBeNull();
  });
});

describe('claimLocalResumes', () => {
  const html = '<!doctype html><html><body>CV</body></html>' as CanonicalResumeHtml;
  const resume = (slug: string) => ({
    slug,
    title: slug,
    html,
    template: { name: 'classic', version: '0.0.3' },
    author: 'system' as const,
  });

  async function localOwnerWith(...slugs: string[]) {
    const local = await db
      .insertInto('users')
      .values({ name: 'Local user' })
      .returning('id')
      .executeTakeFirstOrThrow();
    for (const slug of slugs) {
      await new PostgresResumeRepository(db, local.id).create(resume(slug));
    }
    return local.id;
  }

  it('moves the local owner’s CVs to the signed-in user and removes the local owner', async () => {
    const alex = await createAlex();
    await localOwnerWith('first', 'second');

    expect(await claimLocalResumes(db, alex.id)).toEqual({ kind: 'claimed', resumes: 2 });
    const mine = await new PostgresResumeRepository(db, alex.id).list();
    expect(mine.map((item) => item.slug).sort()).toEqual(['first', 'second']);
    expect(await db.selectFrom('users').select('name').execute()).toEqual([{ name: 'Alex' }]);
  });

  it('moves nothing when the user already has one of the slugs, and says which', async () => {
    const alex = await createAlex();
    await new PostgresResumeRepository(db, alex.id).create(resume('first'));
    const local = await localOwnerWith('first', 'second');

    expect(await claimLocalResumes(db, alex.id)).toEqual({ kind: 'slug-conflicts', slugs: ['first'] });
    expect(await new PostgresResumeRepository(db, local).list()).toHaveLength(2);
  });

  it('has nothing to claim without a local owner', async () => {
    const alex = await createAlex();
    expect(await claimLocalResumes(db, alex.id)).toEqual({ kind: 'nothing-to-claim' });
  });
});
