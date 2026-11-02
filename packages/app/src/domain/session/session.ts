import type { User } from '../user/user.ts';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A session ends this long after sign-in, however active it is. */
export const SESSION_LIFETIME_MS = 30 * DAY;
/** A session also ends after this long without a request. */
export const SESSION_IDLE_TIMEOUT_MS = 7 * DAY;
/** Activity is recorded at most this often, so a busy session costs one write per interval, not one per request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE;

/** A signed-in session, as found by the token from its cookie (ADR-0027). */
export interface Session {
  readonly id: string;
  readonly user: User;
  readonly lastSeenAt: Date;
}

/** When a session started now ends at the latest. */
export function sessionExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SESSION_LIFETIME_MS);
}

/** Sessions last seen before this moment have been idle too long. */
export function sessionIdleCutoff(now: Date): Date {
  return new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS);
}

/** Whether this request should record the session's activity. */
export function sessionNeedsTouch(session: Session, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
