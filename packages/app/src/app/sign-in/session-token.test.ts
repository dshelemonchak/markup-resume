import { describe, expect, it } from 'vitest';
import { hashSessionToken, isSameState, newSessionToken, newSignInState } from './session-token.ts';

describe('session tokens', () => {
  it('are 32 random bytes in base64url, stored as their SHA-256', () => {
    const { token, hash } = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toHaveLength(32);
    expect(hashSessionToken(token)).toEqual(hash);
    expect(newSessionToken().token).not.toBe(token);
  });

  it('hash nothing that is not a token', () => {
    const { token } = newSessionToken();
    for (const value of [
      '',
      token.slice(1),
      `${token}A`,
      `${token.slice(1)}=`,
      `${token.slice(1)}+`,
      `${token.slice(1)} `,
    ]) {
      expect(hashSessionToken(value), value).toBeNull();
    }
  });
});

describe('sign-in state', () => {
  it('is fresh each time and compares equal only to itself', () => {
    const state = newSignInState();
    expect(newSignInState()).not.toBe(state);
    expect(isSameState(state, state)).toBe(true);
    expect(isSameState(state, newSignInState())).toBe(false);
    expect(isSameState(state, state.slice(1))).toBe(false);
    expect(isSameState('', state)).toBe(false);
  });
});
