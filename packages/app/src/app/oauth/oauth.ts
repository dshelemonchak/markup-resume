import {
  type AccessGrant,
  ACCESS_TOKEN_LIFETIME_MS,
  AUTHORIZATION_CODE_LIFETIME_MS,
  isAllowedRedirectUri,
  isValidCodeChallenge,
  isValidCodeVerifier,
  type NewTokens,
  type OAuthClient,
  type OAuthClientRepository,
  type OAuthGrantRepository,
  REFRESH_TOKEN_LIFETIME_MS,
} from '../../domain/index.ts';
import { hashSecret, newClientId, newSecret, pkceMatches } from './oauth-secrets.ts';

/** What the OAuth server for MCP needs (ADR-0028). */
export interface OAuthDependencies {
  readonly clients: OAuthClientRepository;
  readonly grants: OAuthGrantRepository;
  /** The MCP endpoint's public URL: the only resource tokens are issued for (RFC 8707). */
  readonly resource: string;
  /** This authorisation server's identifier, sent back with the code (RFC 9207). */
  readonly issuer: string;
  /** The current time; tests pass a fixed clock. */
  readonly now: () => Date;
}

/** An OAuth error as the token and registration endpoints answer it (RFC 6749 §5.2, RFC 7591 §3.2.2). */
export interface OAuthFailure {
  readonly kind: 'error';
  readonly status: 400 | 401;
  readonly error: string;
  readonly description: string;
}

const failure = (error: string, description: string, status: 400 | 401 = 400): OAuthFailure => ({
  kind: 'error',
  status,
  error,
  description,
});

// --- Registration (RFC 7591) ---

export type RegisterClientResult =
  { readonly kind: 'registered'; readonly client: OAuthClient; readonly issuedAt: Date } | OAuthFailure;

/**
 * Registers a public client. Only what this server supports is accepted: the code flow with refresh tokens, no
 * client secret, and redirect URIs that are https or loopback http.
 */
export async function registerClient(
  dependencies: Pick<OAuthDependencies, 'clients' | 'now'>,
  metadata: unknown,
): Promise<RegisterClientResult> {
  if (typeof metadata !== 'object' || metadata === null) {
    return failure('invalid_client_metadata', 'The body must be a JSON object.');
  }
  const fields = metadata as Record<string, unknown>;
  const redirectUris = fields['redirect_uris'];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    return failure('invalid_redirect_uri', 'redirect_uris must list one to ten URIs.');
  }
  for (const uri of redirectUris) {
    if (typeof uri !== 'string' || !isAllowedRedirectUri(uri)) {
      return failure(
        'invalid_redirect_uri',
        `Not an allowed redirect URI (https, or http on localhost): ${String(uri)}`,
      );
    }
  }
  const authMethod = fields['token_endpoint_auth_method'];
  if (authMethod !== undefined && authMethod !== 'none') {
    return failure(
      'invalid_client_metadata',
      'Only public clients are supported: token_endpoint_auth_method none.',
    );
  }
  if (!isSubsetOf(fields['grant_types'], ['authorization_code', 'refresh_token'])) {
    return failure(
      'invalid_client_metadata',
      'grant_types may only be authorization_code and refresh_token.',
    );
  }
  if (!isSubsetOf(fields['response_types'], ['code'])) {
    return failure('invalid_client_metadata', 'response_types may only be code.');
  }
  const name = fields['client_name'];
  if (name !== undefined && (typeof name !== 'string' || name.length > 200)) {
    return failure('invalid_client_metadata', 'client_name must be a string of at most 200 characters.');
  }

  const client = await dependencies.clients.register({
    clientId: newClientId(),
    clientName: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
    redirectUris: redirectUris as string[],
  });
  return { kind: 'registered', client, issuedAt: dependencies.now() };
}

function isSubsetOf(value: unknown, allowed: readonly string[]): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => allowed.includes(item as string)))
  );
}

// --- Authorisation (the consent step) ---

/** An authorisation request that passed every check: what the consent page shows and approves. */
export interface AuthorizationRequest {
  readonly client: OAuthClient;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string | undefined;
}

export type CheckAuthorizationResult =
  /** Unknown client or a redirect URI it did not register: shown to the user, never redirected to (RFC 6749 §4.1.2.1). */
  | { readonly kind: 'invalid-client' }
  | { readonly kind: 'invalid-redirect-uri' }
  /** Any other problem goes back to the client's redirect URI. */
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'valid'; readonly request: AuthorizationRequest };

/** Checks an authorisation request, from the query of GET /oauth/authorize or the consent form that repeats it. */
export async function checkAuthorizationRequest(
  dependencies: Pick<OAuthDependencies, 'clients' | 'resource' | 'issuer'>,
  params: Readonly<Record<string, string | undefined>>,
): Promise<CheckAuthorizationResult> {
  const client = params['client_id'] ? await dependencies.clients.findByClientId(params['client_id']) : null;
  if (!client) {
    return { kind: 'invalid-client' };
  }
  const redirectUri = params['redirect_uri'];
  if (redirectUri === undefined || !client.redirectUris.includes(redirectUri)) {
    return { kind: 'invalid-redirect-uri' };
  }
  const state = params['state'];
  const back = (error: string, description: string) => ({
    kind: 'redirect' as const,
    location: withParams(redirectUri, {
      error,
      error_description: description,
      state,
      iss: dependencies.issuer,
    }),
  });
  if (params['response_type'] !== 'code') {
    return back('unsupported_response_type', 'Only response_type=code is supported.');
  }
  const codeChallenge = params['code_challenge'];
  if (params['code_challenge_method'] !== 'S256' || !codeChallenge || !isValidCodeChallenge(codeChallenge)) {
    return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  const resource = params['resource'];
  if (resource !== undefined && !sameResource(resource, dependencies.resource)) {
    return back('invalid_target', `Tokens are only issued for ${dependencies.resource}.`);
  }
  return { kind: 'valid', request: { client, redirectUri, codeChallenge, state } };
}

/** The user approved: a code for the client, and where to send the browser with it. */
export async function approveAuthorization(
  dependencies: Pick<OAuthDependencies, 'grants' | 'resource' | 'issuer' | 'now'>,
  request: AuthorizationRequest,
  userId: string,
): Promise<string> {
  const code = newSecret();
  await dependencies.grants.createCode({
    codeHash: code.hash,
    clientId: request.client.id,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: dependencies.resource,
    expiresAt: new Date(dependencies.now().getTime() + AUTHORIZATION_CODE_LIFETIME_MS),
  });
  return withParams(request.redirectUri, {
    code: code.value,
    state: request.state,
    iss: dependencies.issuer,
  });
}

/** The user denied: where to send the browser to tell the client. */
export function denyAuthorization(
  dependencies: Pick<OAuthDependencies, 'issuer'>,
  request: AuthorizationRequest,
): string {
  return withParams(request.redirectUri, {
    error: 'access_denied',
    error_description: 'The user denied access.',
    state: request.state,
    iss: dependencies.issuer,
  });
}

// --- Tokens ---

export interface IssuedTokens {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
}

export type ExchangeTokenResult = { readonly kind: 'issued'; readonly tokens: IssuedTokens } | OAuthFailure;

/** The token endpoint: an approved code, or a refresh token, for new tokens (OAuth 2.1 §4.1.3, §4.3). */
export async function exchangeToken(
  dependencies: OAuthDependencies,
  form: Readonly<Record<string, string | undefined>>,
): Promise<ExchangeTokenResult> {
  const client = form['client_id'] ? await dependencies.clients.findByClientId(form['client_id']) : null;
  if (!client) {
    return failure('invalid_client', 'Unknown client_id.', 401);
  }
  switch (form['grant_type']) {
    case 'authorization_code':
      return exchangeCode(dependencies, client, form);
    case 'refresh_token':
      return refresh(dependencies, client, form);
    default:
      return failure('unsupported_grant_type', 'Use authorization_code or refresh_token.');
  }
}

async function exchangeCode(
  dependencies: OAuthDependencies,
  client: OAuthClient,
  form: Readonly<Record<string, string | undefined>>,
): Promise<ExchangeTokenResult> {
  const { code, redirect_uri: redirectUri, code_verifier: verifier, resource } = form;
  if (!code || !redirectUri || !verifier || !isValidCodeVerifier(verifier)) {
    return failure('invalid_request', 'code, redirect_uri and a valid code_verifier are required.');
  }
  const now = dependencies.now();
  const consumed = await dependencies.grants.consumeCode(hashSecret(code), now);
  if (consumed.kind === 'reused') {
    // A code is exchanged once; a second exchange means someone else has it. End what the first one gave.
    await dependencies.grants.revokeFamilyOfCode(consumed.codeId, now);
    return failure('invalid_grant', 'The code was already used.');
  }
  if (consumed.kind === 'not-found') {
    return failure('invalid_grant', 'Unknown code.');
  }
  const approved = consumed.code;
  if (
    approved.expiresAt <= now ||
    approved.clientId !== client.id ||
    approved.redirectUri !== redirectUri ||
    !pkceMatches(verifier, approved.codeChallenge) ||
    (resource !== undefined && !sameResource(resource, approved.resource))
  ) {
    return failure('invalid_grant', 'The code is expired, or was not issued for this request.');
  }

  const { tokens, stored } = newTokens(now);
  await dependencies.grants.createFamily(
    {
      clientId: client.id,
      userId: approved.userId,
      authorizationCodeId: approved.id,
      resource: approved.resource,
    },
    stored,
  );
  return { kind: 'issued', tokens };
}

async function refresh(
  dependencies: OAuthDependencies,
  client: OAuthClient,
  form: Readonly<Record<string, string | undefined>>,
): Promise<ExchangeTokenResult> {
  const refreshToken = form['refresh_token'];
  if (!refreshToken) {
    return failure('invalid_request', 'refresh_token is required.');
  }
  if (form['resource'] !== undefined && !sameResource(form['resource'], dependencies.resource)) {
    return failure('invalid_target', `Tokens are only issued for ${dependencies.resource}.`);
  }
  const now = dependencies.now();
  const { tokens, stored } = newTokens(now);
  const rotated = await dependencies.grants.rotateRefreshToken(hashSecret(refreshToken), client, now, stored);
  if (rotated.kind !== 'rotated') {
    return failure('invalid_grant', 'The refresh token is invalid, expired or already used.');
  }
  return { kind: 'issued', tokens };
}

function newTokens(now: Date): { tokens: IssuedTokens; stored: NewTokens } {
  const access = newSecret();
  const refreshToken = newSecret();
  return {
    tokens: {
      access_token: access.value,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_LIFETIME_MS / 1000,
      refresh_token: refreshToken.value,
    },
    stored: {
      accessTokenHash: access.hash,
      accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS),
      refreshTokenHash: refreshToken.hash,
      refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
    },
  };
}

/** Who an access token acts for, if it is valid now: what MCP checks on every call. */
export async function verifyAccessToken(
  dependencies: Pick<OAuthDependencies, 'grants' | 'now'>,
  token: string,
): Promise<AccessGrant | null> {
  return dependencies.grants.findAccessToken(hashSecret(token), dependencies.now());
}

// --- Helpers ---

/** Resource identifiers compare as URLs without a fragment or a trailing slash. */
function sameResource(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/#.*$/, '').replace(/\/$/, '');
  return normalize(a) === normalize(b);
}

/** The URL with these query parameters added; undefined values are left out. */
function withParams(base: string, params: Readonly<Record<string, string | undefined>>): string {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  return url.toString();
}
