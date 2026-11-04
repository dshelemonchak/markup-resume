import type { OAuthClient } from './oauth.ts';

/** Port: the clients that registered themselves (oauth_clients, ADR-0028). */
export interface OAuthClientRepository {
  register(client: Omit<OAuthClient, 'id'>): Promise<OAuthClient>;
  findByClientId(clientId: string): Promise<OAuthClient | null>;
}

/**
 * Port: authorisation codes and the token families issued from them (ADR-0028). Codes and tokens are found by
 * their SHA-256 hash and never stored themselves. Every step that must happen once happens in one transaction.
 */
export interface OAuthGrantRepository {
  createCode(code: NewAuthorizationCode): Promise<void>;
  /**
   * Marks the code used and returns it, in one step, whether or not it has expired: the caller checks. reused when
   * it was used before, which is the sign of a stolen code; not-found when there is no such code.
   */
  consumeCode(codeHash: Uint8Array, now: Date): Promise<ConsumeCodeResult>;
  /** Revokes the token family that this code started, if it started one. */
  revokeFamilyOfCode(codeId: string, now: Date): Promise<void>;
  /** A new token family for an approved code, with its first access and refresh tokens. */
  createFamily(family: NewTokenFamily, tokens: NewTokens): Promise<void>;
  /** The grant behind an access token that has not expired and whose family is not revoked; else null. */
  findAccessToken(tokenHash: Uint8Array, now: Date): Promise<AccessGrant | null>;
  /**
   * Uses a refresh token once: marks it used and adds the next tokens to its family, in one step. reused when it
   * was used before, and then the whole family is revoked; invalid when it is unknown, expired, revoked, or was
   * issued to another client.
   */
  rotateRefreshToken(
    tokenHash: Uint8Array,
    client: { readonly id: string },
    now: Date,
    next: NewTokens,
  ): Promise<RotateRefreshTokenResult>;
}

export interface NewAuthorizationCode {
  readonly codeHash: Uint8Array;
  /** The client's row id. */
  readonly clientId: string;
  readonly userId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string;
  readonly expiresAt: Date;
}

export interface AuthorizationCode extends Omit<NewAuthorizationCode, 'codeHash'> {
  readonly id: string;
}

export type ConsumeCodeResult =
  | { readonly kind: 'consumed'; readonly code: AuthorizationCode }
  | { readonly kind: 'reused'; readonly codeId: string }
  | { readonly kind: 'not-found' };

export interface NewTokenFamily {
  /** The client's row id. */
  readonly clientId: string;
  readonly userId: string;
  readonly authorizationCodeId: string;
  readonly resource: string;
}

export interface NewTokens {
  readonly accessTokenHash: Uint8Array;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenHash: Uint8Array;
  readonly refreshTokenExpiresAt: Date;
}

/** Who an access token acts for, and where it may be used. */
export interface AccessGrant {
  readonly userId: string;
  /** The client's public id. */
  readonly clientId: string;
  readonly resource: string;
  readonly expiresAt: Date;
}

export type RotateRefreshTokenResult =
  { readonly kind: 'rotated' } | { readonly kind: 'reused' } | { readonly kind: 'invalid' };
