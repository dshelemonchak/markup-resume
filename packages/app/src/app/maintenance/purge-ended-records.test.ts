import { describe, expect, it } from 'vitest';
import { ENDED_RECORD_RETENTION_MS, SESSION_IDLE_TIMEOUT_MS } from '../../domain/index.ts';
import { InMemoryOAuthClientRepository, InMemoryOAuthGrantRepository } from '../testing/in-memory-oauth.ts';
import { InMemorySessionRepository } from '../testing/in-memory-session-repository.ts';
import { purgeEndedRecords } from './purge-ended-records.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-07T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const bytes = (name: string) => new TextEncoder().encode(name.padEnd(32, '-'));

describe('purgeEndedRecords', () => {
  it('deletes sessions only once they ended longer ago than the retention period', async () => {
    let createdAt = NOW;
    const sessions = new InMemorySessionRepository(
      (id) => ({ id, name: 'Alex' }),
      () => createdAt,
    );
    const grants = new InMemoryOAuthGrantRepository(new InMemoryOAuthClientRepository());
    // Expired 8 days ago: goes. Expired 6 days ago: stays.
    await sessions.create({ userId: 'u', tokenHash: bytes('old'), expiresAt: ago(8 * DAY) });
    await sessions.create({ userId: 'u', tokenHash: bytes('recent'), expiresAt: ago(6 * DAY) });
    // Last seen past the idle limit plus retention: goes, though it has not expired.
    createdAt = ago(SESSION_IDLE_TIMEOUT_MS + ENDED_RECORD_RETENTION_MS + DAY);
    await sessions.create({
      userId: 'u',
      tokenHash: bytes('idle'),
      expiresAt: new Date(NOW.getTime() + DAY),
    });

    expect(await purgeEndedRecords({ sessions, grants, now: () => NOW })).toEqual({ sessions: 2, grants: 0 });
    expect(sessions.size).toBe(1);
  });

  it('deletes expired codes and tokens, and families with nothing left', async () => {
    const sessions = new InMemorySessionRepository(
      (id) => ({ id, name: 'Alex' }),
      () => NOW,
    );
    const clients = new InMemoryOAuthClientRepository();
    const grants = new InMemoryOAuthGrantRepository(clients);
    const client = await clients.register({
      clientId: 'c',
      clientName: null,
      redirectUris: ['https://x.test/cb'],
    });
    const code = (name: string) => ({
      codeHash: bytes(name),
      clientId: client.id,
      userId: 'u',
      redirectUri: 'https://x.test/cb',
      codeChallenge: 'c'.repeat(43),
      resource: 'https://app.test/mcp',
      expiresAt: ago(30 * DAY),
    });
    // A code never exchanged, long expired.
    await grants.createCode(code('unused'));
    // A code whose family's tokens all expired long ago.
    await grants.createCode(code('old'));
    const old = await grants.consumeCode(bytes('old'), ago(30 * DAY));
    if (old.kind !== 'consumed') {
      throw new Error('not consumed');
    }
    await grants.createFamily(
      {
        clientId: client.id,
        userId: 'u',
        authorizationCodeId: old.code.id,
        resource: 'https://app.test/mcp',
      },
      {
        accessTokenHash: bytes('a-old'),
        accessTokenExpiresAt: ago(29 * DAY),
        refreshTokenHash: bytes('r-old'),
        refreshTokenExpiresAt: ago(8 * DAY),
      },
    );
    // A code whose family still has a live refresh token: the family and the code stay.
    await grants.createCode(code('live'));
    const live = await grants.consumeCode(bytes('live'), ago(30 * DAY));
    if (live.kind !== 'consumed') {
      throw new Error('not consumed');
    }
    await grants.createFamily(
      {
        clientId: client.id,
        userId: 'u',
        authorizationCodeId: live.code.id,
        resource: 'https://app.test/mcp',
      },
      {
        accessTokenHash: bytes('a-live'),
        accessTokenExpiresAt: ago(29 * DAY),
        refreshTokenHash: bytes('r-live'),
        refreshTokenExpiresAt: ago(6 * DAY),
      },
    );

    // Tokens: a-old, r-old, a-live. Family: old. Codes: unused, old.
    expect(await purgeEndedRecords({ sessions, grants, now: () => NOW })).toEqual({ sessions: 0, grants: 6 });
    expect(grants.size).toEqual({ codes: 1, families: 1, tokens: 1 });
  });
});
