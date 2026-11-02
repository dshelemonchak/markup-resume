import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits: guessing a token is out of reach, however many requests an attacker sends. */
const TOKEN_BYTES = 32;
/** A token as the cookie carries it: 32 bytes in base64url, without padding. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** A new session token for the cookie, and the hash to store in its place (ADR-0027). */
export function newSessionToken(): { readonly token: string; readonly hash: Uint8Array } {
  const token = randomBytes(TOKEN_BYTES);
  return { token: token.toString('base64url'), hash: sha256(token) };
}

/** The stored hash for a token from a cookie; null when the value is not a token at all. */
export function hashSessionToken(token: string): Uint8Array | null {
  if (!TOKEN_FORMAT.test(token)) {
    return null;
  }
  return sha256(Buffer.from(token, 'base64url'));
}

/** A one-time value that ties the GitHub callback to the browser that started the sign-in (CSRF). */
export function newSignInState(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Compares two state values in constant time, so the comparison leaks nothing about the expected one. */
export function isSameState(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash('sha256').update(bytes).digest();
}
