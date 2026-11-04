import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A new secret (code or token) of 256 random bits, and the hash to store in its place (ADR-0028). */
export function newSecret(): { readonly value: string; readonly hash: Uint8Array } {
  const value = randomBytes(32).toString('base64url');
  return { value, hash: hashSecret(value) };
}

/** The stored hash of a code or token as the client sends it. */
export function hashSecret(value: string): Uint8Array {
  return createHash('sha256').update(value).digest();
}

/** A new public client id: unguessable, though not a secret. */
export function newClientId(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * PKCE S256 (RFC 7636): whether the verifier hashes to the challenge from the authorisation request, compared in
 * constant time.
 */
export function pkceMatches(verifier: string, challenge: string): boolean {
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
