import type { Session } from './session.ts';

/**
 * Port: sign-in sessions (ADR-0027). Sessions are found by the SHA-256 hash of their token; the token itself is
 * never stored.
 */
export interface SessionRepository {
  create(session: NewSession): Promise<void>;
  /** The session with this token hash, unless it has expired by now or was last seen before idleSince; else null. */
  findActive(
    tokenHash: Uint8Array,
    at: { readonly now: Date; readonly idleSince: Date },
  ): Promise<Session | null>;
  /** Records activity on the session. */
  touch(id: string, at: Date): Promise<void>;
  /** Ends the session with this token hash; nothing happens when there is none. */
  delete(tokenHash: Uint8Array): Promise<void>;
}

export interface NewSession {
  readonly userId: string;
  readonly tokenHash: Uint8Array;
  readonly expiresAt: Date;
}
