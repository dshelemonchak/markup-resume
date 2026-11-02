import {
  type ExternalIdentity,
  type IdentityProvider,
  type Session,
  type SessionRepository,
  sessionExpiresAt,
  sessionIdleCutoff,
  sessionNeedsTouch,
  type User,
  type UserRepository,
} from '../../domain/index.ts';
import { hashSessionToken, isSameState, newSessionToken, newSignInState } from './session-token.ts';

/** What signing in needs: who signs in (the provider), who they are here (users), and their sessions. */
export interface SignInDependencies {
  readonly identityProvider: IdentityProvider;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  /** The current time; tests pass a fixed clock. */
  readonly now: () => Date;
}

/**
 * The first step of signing in: a fresh state for the caller to keep (in a short-lived cookie), and the provider's
 * page to send the browser to.
 */
export function startSignIn(dependencies: Pick<SignInDependencies, 'identityProvider'>): {
  readonly state: string;
  readonly url: string;
} {
  const state = newSignInState();
  return { state, url: dependencies.identityProvider.authorizationUrl(state) };
}

export type CompleteSignInResult =
  | {
      readonly kind: 'signed-in';
      readonly user: User;
      /** For the session cookie; only its hash is stored. */
      readonly sessionToken: string;
      readonly expiresAt: Date;
    }
  /** The state is missing or is not the one this browser started with: possibly a forged callback. */
  | { readonly kind: 'invalid-state' }
  /** The provider refused the code. */
  | { readonly kind: 'rejected' };

/**
 * The callback of signing in: checks that this browser started it, learns from the provider who signed in, finds
 * or creates that user, and starts a new session. A new session on every sign-in, so a session id planted before
 * sign-in is never upgraded (session fixation).
 */
export async function completeSignIn(
  dependencies: SignInDependencies,
  callback: { readonly code: string; readonly state: string; readonly expectedState: string | undefined },
): Promise<CompleteSignInResult> {
  if (callback.expectedState === undefined || !isSameState(callback.state, callback.expectedState)) {
    return { kind: 'invalid-state' };
  }
  const identified = await dependencies.identityProvider.identify(callback.code);
  if (identified.kind === 'rejected') {
    return { kind: 'rejected' };
  }
  const user = await findOrCreateUser(dependencies.users, identified.identity);

  const { token, hash } = newSessionToken();
  const expiresAt = sessionExpiresAt(dependencies.now());
  await dependencies.sessions.create({ userId: user.id, tokenHash: hash, expiresAt });
  return { kind: 'signed-in', user, sessionToken: token, expiresAt };
}

/** The user behind a session cookie, or null. Records the session's activity every few minutes, not every request. */
export async function resolveSession(
  dependencies: Pick<SignInDependencies, 'sessions' | 'now'>,
  sessionToken: string | undefined,
): Promise<Session | null> {
  const hash = sessionToken === undefined ? null : hashSessionToken(sessionToken);
  if (hash === null) {
    return null;
  }
  const now = dependencies.now();
  const session = await dependencies.sessions.findActive(hash, { now, idleSince: sessionIdleCutoff(now) });
  if (session && sessionNeedsTouch(session, now)) {
    await dependencies.sessions.touch(session.id, now);
  }
  return session;
}

/** Ends the session behind a cookie on the server, not only in this browser. */
export async function signOut(
  dependencies: Pick<SignInDependencies, 'sessions'>,
  sessionToken: string | undefined,
): Promise<void> {
  const hash = sessionToken === undefined ? null : hashSessionToken(sessionToken);
  if (hash !== null) {
    await dependencies.sessions.delete(hash);
  }
}

/**
 * The user for an identity, created on its first sign-in. When two first sign-ins of the same account race, the one
 * that loses finds the user the other created.
 */
async function findOrCreateUser(users: UserRepository, identity: ExternalIdentity): Promise<User> {
  const existing = await users.findByIdentity(identity);
  if (existing) {
    return existing;
  }
  const created = await users.createWithIdentity(identity);
  if (created.kind === 'created') {
    return created.user;
  }
  const winner = await users.findByIdentity(identity);
  if (!winner) {
    throw new Error(`The ${identity.provider} identity is taken, yet no user signs in with it`);
  }
  return winner;
}
