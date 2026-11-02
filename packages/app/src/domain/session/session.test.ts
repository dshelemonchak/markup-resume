import { describe, expect, it } from 'vitest';
import { sessionExpiresAt, sessionIdleCutoff, sessionNeedsTouch } from './session.ts';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const now = new Date('2026-11-02T10:00:00.000Z');
const session = (lastSeenAt: Date) => ({ id: 's', user: { id: 'u', name: null }, lastSeenAt });

describe('session lifetime', () => {
  it('ends 30 days after sign-in', () => {
    expect(sessionExpiresAt(now)).toEqual(new Date(now.getTime() + 30 * DAY));
  });

  it('counts a session idle after 7 days without a request', () => {
    expect(sessionIdleCutoff(now)).toEqual(new Date(now.getTime() - 7 * DAY));
  });

  it('records activity once 5 minutes have passed since the last time', () => {
    expect(sessionNeedsTouch(session(new Date(now.getTime() - 5 * MINUTE + 1)), now)).toBe(false);
    expect(sessionNeedsTouch(session(new Date(now.getTime() - 5 * MINUTE)), now)).toBe(true);
  });
});
