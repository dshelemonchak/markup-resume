const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** An authorisation code is exchanged at once by the client, so it lives briefly (ADR-0028). */
export const AUTHORIZATION_CODE_LIFETIME_MS = MINUTE;
export const ACCESS_TOKEN_LIFETIME_MS = 60 * MINUTE;
/** A refresh token is rotated on every use; this bounds one that is never used. */
export const REFRESH_TOKEN_LIFETIME_MS = 30 * DAY;

/** A client that registered itself (RFC 7591). Public: it has no secret, so PKCE proves it holds the code. */
export interface OAuthClient {
  /** The row's id, for references inside the app. */
  readonly id: string;
  /** The id the client sends in OAuth requests. */
  readonly clientId: string;
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
}

/** The hosts a plain-http redirect URI may name: only this machine, where a native app listens for the code. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Whether a client may register this redirect URI: https, or http to a loopback host, with no fragment (OAuth 2.1).
 * Anything else could hand the code to a page an attacker controls.
 */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash !== '' || value.includes('#')) {
    return false;
  }
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}

/** A PKCE code verifier (RFC 7636): 43 to 128 unreserved characters. */
export function isValidCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

/** A PKCE S256 challenge: the base64url SHA-256 of a verifier, 43 characters. */
export function isValidCodeChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
