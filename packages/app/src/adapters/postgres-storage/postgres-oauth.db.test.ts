import { createHash, randomUUID } from 'node:crypto';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NewTokens, OAuthClient } from '../../domain/index.ts';
import { createDatabase, type Database } from './database.ts';
import { PostgresOAuthClientRepository } from './postgres-oauth-client-repository.ts';
import { PostgresOAuthGrantRepository } from './postgres-oauth-grant-repository.ts';
import { migrateToLatest } from './run-migrations.ts';

// Runs against a real Postgres (pnpm test:db, with DATABASE_URL), in a database of its own.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set: database tests need a Postgres to create a test database in');
}

const testName = `markup_test_${randomUUID().replaceAll('-', '')}`;
let admin: Kysely<Database>;
let db: Kysely<Database>;
let clients: PostgresOAuthClientRepository;
let grants: PostgresOAuthGrantRepository;
let client: OAuthClient;
let userId: string;

const RESOURCE = 'http://localhost:3000/mcp';
const HOUR = 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest();
const tokens = (name: string, now: Date): NewTokens => ({
  accessTokenHash: hash(`access-${name}`),
  accessTokenExpiresAt: new Date(now.getTime() + HOUR),
  refreshTokenHash: hash(`refresh-${name}`),
  refreshTokenExpiresAt: new Date(now.getTime() + 24 * HOUR),
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
  await sql`truncate users, oauth_clients cascade`.execute(db);
  clients = new PostgresOAuthClientRepository(db);
  grants = new PostgresOAuthGrantRepository(db);
  client = await clients.register({
    clientId: 'client-1',
    clientName: 'Claude Code',
    redirectUris: ['http://localhost:33418/callback'],
  });
  userId = (await db.insertInto('users').values({ name: 'Alex' }).returning('id').executeTakeFirstOrThrow())
    .id;
});

/** An approved code "code", and the family its exchange starts with tokens "first". */
async function familyFromCode(now: Date) {
  await grants.createCode({
    codeHash: hash('code'),
    clientId: client.id,
    userId,
    redirectUri: 'http://localhost:33418/callback',
    codeChallenge: 'c'.repeat(43),
    resource: RESOURCE,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  const consumed = await grants.consumeCode(hash('code'), now);
  if (consumed.kind !== 'consumed') {
    throw new Error('not consumed');
  }
  await grants.createFamily(
    { clientId: client.id, userId, authorizationCodeId: consumed.code.id, resource: RESOURCE },
    tokens('first', now),
  );
  return consumed.code;
}

describe('PostgresOAuthClientRepository', () => {
  it('registers a client and finds it by its public id', async () => {
    expect(await clients.findByClientId('client-1')).toEqual(client);
    expect(await clients.findByClientId('other')).toBeNull();
  });
});

describe('PostgresOAuthGrantRepository', () => {
  it('gives a code out once, even to two concurrent exchanges, and knows it was used', async () => {
    const now = new Date();
    await grants.createCode({
      codeHash: hash('code'),
      clientId: client.id,
      userId,
      redirectUri: 'http://localhost:33418/callback',
      codeChallenge: 'c'.repeat(43),
      resource: RESOURCE,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const results = await Promise.all([
      grants.consumeCode(hash('code'), now),
      grants.consumeCode(hash('code'), now),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(['consumed', 'reused']);
    expect(await grants.consumeCode(hash('unknown'), now)).toEqual({ kind: 'not-found' });
  });

  it('finds an access token for its user and client until it expires', async () => {
    const now = new Date();
    await familyFromCode(now);
    expect(await grants.findAccessToken(hash('access-first'), now)).toEqual({
      userId,
      clientId: 'client-1',
      resource: RESOURCE,
      expiresAt: new Date(now.getTime() + HOUR),
    });
    expect(await grants.findAccessToken(hash('access-first'), new Date(now.getTime() + HOUR))).toBeNull();
    expect(await grants.findAccessToken(hash('refresh-first'), now)).toBeNull();
  });

  it('revokes the family a reused code started', async () => {
    const now = new Date();
    const code = await familyFromCode(now);
    await grants.revokeFamilyOfCode(code.id, now);
    expect(await grants.findAccessToken(hash('access-first'), now)).toBeNull();
  });

  it('rotates a refresh token once, even for two concurrent requests, and revokes the family on reuse', async () => {
    const now = new Date();
    await familyFromCode(now);
    const results = await Promise.all([
      grants.rotateRefreshToken(hash('refresh-first'), client, now, tokens('second', now)),
      grants.rotateRefreshToken(hash('refresh-first'), client, now, tokens('third', now)),
    ]);
    // One wins; the other sees the token used, which revokes the family, the winner's new tokens included.
    expect(results.map((result) => result.kind).sort()).toEqual(['reused', 'rotated']);
    for (const name of ['first', 'second', 'third']) {
      expect(await grants.findAccessToken(hash(`access-${name}`), now), name).toBeNull();
    }
  });

  it('refuses a refresh token of another client, an expired one, and an unknown one', async () => {
    const now = new Date();
    await familyFromCode(now);
    const other = await clients.register({
      clientId: 'client-2',
      clientName: null,
      redirectUris: ['https://a.test/'],
    });
    expect(await grants.rotateRefreshToken(hash('refresh-first'), other, now, tokens('x', now))).toEqual({
      kind: 'invalid',
    });
    const later = new Date(now.getTime() + 24 * HOUR);
    expect(await grants.rotateRefreshToken(hash('refresh-first'), client, later, tokens('y', later))).toEqual(
      {
        kind: 'invalid',
      },
    );
    expect(await grants.rotateRefreshToken(hash('unknown'), client, now, tokens('z', now))).toEqual({
      kind: 'invalid',
    });
    // None of the refusals used the token up.
    expect(
      (await grants.rotateRefreshToken(hash('refresh-first'), client, now, tokens('ok', now))).kind,
    ).toBe('rotated');
  });

  it('deletes expired codes and tokens, then families with no tokens and codes no family needs', async () => {
    const past = new Date(Date.now() - 30 * 24 * HOUR);
    const code = await familyFromCode(past);
    await grants.createCode({
      codeHash: hash('unused'),
      clientId: client.id,
      userId,
      redirectUri: 'http://localhost:33418/callback',
      codeChallenge: 'c'.repeat(43),
      resource: RESOURCE,
      expiresAt: past,
    });
    const before = new Date(past.getTime() + 2 * HOUR);

    // The access token expired; the refresh token (24 h) has not: only the access token and the unused code go.
    expect(await grants.deleteExpired(before)).toBe(2);
    expect(await db.selectFrom('oauth_authorization_codes').select('id').execute()).toEqual([
      { id: code.id },
    ]);

    // Once the refresh token has expired too, the family and its code go with it.
    expect(await grants.deleteExpired(new Date())).toBe(3);
    for (const table of [
      'oauth_token_families',
      'oauth_authorization_codes',
      'oauth_refresh_tokens',
    ] as const) {
      expect(await db.selectFrom(table).select('id').execute()).toEqual([]);
    }
  });

  it('ends every grant of a deleted user', async () => {
    const now = new Date();
    await familyFromCode(now);
    await db.deleteFrom('users').where('id', '=', userId).execute();
    expect(await grants.findAccessToken(hash('access-first'), now)).toBeNull();
  });
});
