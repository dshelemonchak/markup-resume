import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ExternalIdentity,
  IdentifyResult,
  IdentityProvider,
  UserRepository,
} from '../../domain/index.ts';
import { InMemorySessionRepository } from '../testing/in-memory-session-repository.ts';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository.ts';
import { completeSignIn, resolveSession, type SignInDependencies, signOut, startSignIn } from './sign-in.ts';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const ALEX: ExternalIdentity = { provider: 'github', providerUserId: '42', name: 'Alex', email: null };

let now: Date;
let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let identified: IdentifyResult;
let dependencies: SignInDependencies;

const provider: IdentityProvider = {
  name: 'github',
  authorizationUrl: (state) => `https://github.test/authorize?state=${state}`,
  identify: () => Promise.resolve(identified),
};

beforeEach(() => {
  now = new Date('2026-11-02T10:00:00.000Z');
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository(
    (id) => users.byId(id),
    () => now,
  );
  identified = { kind: 'identified', identity: ALEX };
  dependencies = { identityProvider: provider, users, sessions, allowlist: null, now: () => now };
});

/** A whole sign-in: start, then GitHub's callback with the state from the start. */
async function signIn(deps = dependencies) {
  const { state } = startSignIn(deps);
  return completeSignIn(deps, { code: 'code', state, expectedState: state });
}

describe('startSignIn', () => {
  it('gives a fresh state each time and sends it to the provider', () => {
    const first = startSignIn(dependencies);
    const second = startSignIn(dependencies);
    expect(first.state).not.toBe(second.state);
    expect(first.url).toBe(`https://github.test/authorize?state=${first.state}`);
  });
});

describe('completeSignIn', () => {
  it('refuses a callback without the state, or with another one, before asking the provider', async () => {
    let asked = false;
    const identify = () => {
      asked = true;
      return Promise.resolve(identified);
    };
    const deps = { ...dependencies, identityProvider: { ...provider, identify } };
    const { state } = startSignIn(deps);
    expect(await completeSignIn(deps, { code: 'c', state, expectedState: undefined })).toEqual({
      kind: 'invalid-state',
    });
    expect(await completeSignIn(deps, { code: 'c', state, expectedState: `${state}x` })).toEqual({
      kind: 'invalid-state',
    });
    expect(asked).toBe(false);
  });

  it('starts no session when the provider refuses the code', async () => {
    identified = { kind: 'rejected' };
    expect(await signIn()).toEqual({ kind: 'rejected' });
    expect(sessions.size).toBe(0);
  });

  it('turns away someone not on the allowlist, without creating a user or a session', async () => {
    const deps = { ...dependencies, allowlist: new Set(['someone-else']) };
    expect(await signIn(deps)).toEqual({ kind: 'not-allowed' });
    expect(await users.findByIdentity(ALEX)).toBeNull();
    expect(sessions.size).toBe(0);
    expect((await signIn({ ...dependencies, allowlist: new Set([ALEX.providerUserId]) })).kind).toBe(
      'signed-in',
    );
  });

  it('creates the user on the first sign-in, finds them later, and starts a new session each time', async () => {
    const first = await signIn();
    const second = await signIn();
    if (first.kind !== 'signed-in' || second.kind !== 'signed-in') {
      throw new Error('not signed in');
    }
    expect(first.user).toEqual({ id: 'user-1', name: 'Alex' });
    expect(second.user).toEqual(first.user);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    expect(first.expiresAt).toEqual(new Date(now.getTime() + 30 * DAY));
    expect(sessions.size).toBe(2);
  });

  it('uses the user that a concurrent first sign-in created', async () => {
    const winner = { id: 'user-9', name: 'Alex' };
    let found = 0;
    const racing: UserRepository = {
      // Nobody yet when this request looks, the winner by the time it looks again.
      findByIdentity: () => Promise.resolve(found++ === 0 ? null : winner),
      createWithIdentity: () => Promise.resolve({ kind: 'identity-taken' }),
    };
    const deps = {
      ...dependencies,
      users: racing,
      sessions: new InMemorySessionRepository(
        () => winner,
        () => now,
      ),
    };
    expect(await signIn(deps)).toMatchObject({ kind: 'signed-in', user: winner });
  });
});

describe('resolveSession', () => {
  async function signedInToken() {
    const result = await signIn();
    if (result.kind !== 'signed-in') {
      throw new Error('not signed in');
    }
    return result.sessionToken;
  }

  it('finds the user behind a session cookie', async () => {
    const token = await signedInToken();
    expect(await resolveSession(dependencies, token)).toMatchObject({ user: { id: 'user-1', name: 'Alex' } });
  });

  it('finds nobody without a cookie, for a value that is not a token, or for an unknown token', async () => {
    await signedInToken();
    expect(await resolveSession(dependencies, undefined)).toBeNull();
    expect(await resolveSession(dependencies, 'not-a-token')).toBeNull();
    expect(await resolveSession(dependencies, 'A'.repeat(43))).toBeNull();
  });

  it('ends a session after 30 days, however active', async () => {
    const token = await signedInToken();
    for (let day = 6; day < 30; day += 6) {
      now = new Date(Date.parse('2026-11-02T10:00:00.000Z') + day * DAY);
      expect(await resolveSession(dependencies, token)).not.toBeNull();
    }
    now = new Date(Date.parse('2026-11-02T10:00:00.000Z') + 30 * DAY);
    expect(await resolveSession(dependencies, token)).toBeNull();
  });

  it('ends a session after 7 days without a request', async () => {
    const token = await signedInToken();
    now = new Date(now.getTime() + 7 * DAY + 1);
    expect(await resolveSession(dependencies, token)).toBeNull();
  });

  it('records activity at most every 5 minutes', async () => {
    const token = await signedInToken();
    now = new Date(now.getTime() + 4 * MINUTE);
    await resolveSession(dependencies, token);
    expect(sessions.touched).toEqual([]);
    now = new Date(now.getTime() + MINUTE);
    await resolveSession(dependencies, token);
    expect(sessions.touched).toEqual(['session-1']);
  });
});

describe('signOut', () => {
  it('ends the session on the server', async () => {
    const result = await signIn();
    if (result.kind !== 'signed-in') {
      throw new Error('not signed in');
    }
    await signOut(dependencies, result.sessionToken);
    expect(await resolveSession(dependencies, result.sessionToken)).toBeNull();
  });

  it('does nothing without a cookie or for a value that is not a token', async () => {
    await signIn();
    await signOut(dependencies, undefined);
    await signOut(dependencies, 'not-a-token');
    expect(sessions.size).toBe(1);
  });
});
