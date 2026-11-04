import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryOAuthClientRepository, InMemoryOAuthGrantRepository } from '../testing/in-memory-oauth.ts';
import {
  approveAuthorization,
  type AuthorizationRequest,
  checkAuthorizationRequest,
  denyAuthorization,
  exchangeToken,
  type IssuedTokens,
  type OAuthDependencies,
  registerClient,
  verifyAccessToken,
} from './oauth.ts';

const RESOURCE = 'http://localhost:3000/mcp';
const ISSUER = 'http://localhost:4200';
const REDIRECT = 'http://localhost:33418/callback';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const MINUTE = 60 * 1000;

let now: Date;
let clients: InMemoryOAuthClientRepository;
let deps: OAuthDependencies;
let clientId: string;

beforeEach(async () => {
  now = new Date('2026-11-03T10:00:00.000Z');
  clients = new InMemoryOAuthClientRepository();
  deps = {
    clients,
    grants: new InMemoryOAuthGrantRepository(clients),
    resource: RESOURCE,
    issuer: ISSUER,
    now: () => now,
  };
  const registered = await registerClient(deps, { client_name: 'Claude Code', redirect_uris: [REDIRECT] });
  if (registered.kind !== 'registered') {
    throw new Error('not registered');
  }
  clientId = registered.client.clientId;
});

const authorizeParams = (overrides: Record<string, string | undefined> = {}) => ({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: REDIRECT,
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  state: 'client-state',
  resource: RESOURCE,
  ...overrides,
});

async function validRequest(): Promise<AuthorizationRequest> {
  const checked = await checkAuthorizationRequest(deps, authorizeParams());
  if (checked.kind !== 'valid') {
    throw new Error(`not valid: ${checked.kind}`);
  }
  return checked.request;
}

/** Approves a request for user-1 and returns the code from the redirect. */
async function approvedCode(): Promise<string> {
  const location = new URL(await approveAuthorization(deps, await validRequest(), 'user-1'));
  return location.searchParams.get('code')!;
}

const tokenForm = (code: string, overrides: Record<string, string | undefined> = {}) => ({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT,
  client_id: clientId,
  code_verifier: VERIFIER,
  resource: RESOURCE,
  ...overrides,
});

async function issued(form: Record<string, string | undefined>): Promise<IssuedTokens> {
  const result = await exchangeToken(deps, form);
  if (result.kind !== 'issued') {
    throw new Error(`not issued: ${result.error}`);
  }
  return result.tokens;
}

describe('registerClient', () => {
  it('registers a public client with https or loopback redirect URIs', async () => {
    const result = await registerClient(deps, {
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:9000/cb'],
      token_endpoint_auth_method: 'none',
    });
    expect(result).toMatchObject({ kind: 'registered', client: { clientName: null } });
  });

  it('refuses redirect URIs that could hand the code to someone else', async () => {
    for (const uri of [
      'http://evil.test/cb',
      'https://app.test/cb#frag',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(await registerClient(deps, { redirect_uris: [uri] }), uri).toMatchObject({
        kind: 'error',
        error: 'invalid_redirect_uri',
      });
    }
    expect(await registerClient(deps, { redirect_uris: [] })).toMatchObject({
      error: 'invalid_redirect_uri',
    });
  });

  it('refuses confidential clients and flows this server does not run', async () => {
    for (const metadata of [
      { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' },
      { redirect_uris: [REDIRECT], grant_types: ['client_credentials'] },
      { redirect_uris: [REDIRECT], response_types: ['token'] },
    ]) {
      expect(await registerClient(deps, metadata)).toMatchObject({ error: 'invalid_client_metadata' });
    }
  });
});

describe('checkAuthorizationRequest', () => {
  it('accepts a code request with PKCE S256 for this resource', async () => {
    expect((await checkAuthorizationRequest(deps, authorizeParams())).kind).toBe('valid');
    expect((await checkAuthorizationRequest(deps, authorizeParams({ resource: undefined }))).kind).toBe(
      'valid',
    );
  });

  it('never redirects for an unknown client or a redirect URI the client did not register', async () => {
    expect(await checkAuthorizationRequest(deps, authorizeParams({ client_id: 'unknown' }))).toEqual({
      kind: 'invalid-client',
    });
    for (const uri of ['http://localhost:33418/other', 'https://evil.test/callback', undefined]) {
      expect(await checkAuthorizationRequest(deps, authorizeParams({ redirect_uri: uri })), uri).toEqual({
        kind: 'invalid-redirect-uri',
      });
    }
  });

  it('sends other problems back to the client, with its state and our issuer', async () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ response_type: 'token' }, 'unsupported_response_type'],
      [{ code_challenge: undefined }, 'invalid_request'],
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ resource: 'https://other.test/mcp' }, 'invalid_target'],
    ];
    for (const [overrides, error] of cases) {
      const checked = await checkAuthorizationRequest(deps, authorizeParams(overrides));
      if (checked.kind !== 'redirect') {
        throw new Error(`expected a redirect for ${error}`);
      }
      const location = new URL(checked.location);
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get('error')).toBe(error);
      expect(location.searchParams.get('state')).toBe('client-state');
      expect(location.searchParams.get('iss')).toBe(ISSUER);
    }
  });
});

describe('approve and deny', () => {
  it('sends the code back with the state and the issuer', async () => {
    const location = new URL(await approveAuthorization(deps, await validRequest(), 'user-1'));
    expect(location.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('state')).toBe('client-state');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
  });

  it('tells the client when the user denies', async () => {
    const location = new URL(denyAuthorization(deps, await validRequest()));
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
  });
});

describe('exchangeToken with a code', () => {
  it('issues tokens for the user who approved, bound to this resource', async () => {
    const tokens = await issued(tokenForm(await approvedCode()));
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    expect(await verifyAccessToken(deps, tokens.access_token)).toEqual({
      userId: 'user-1',
      clientId,
      resource: RESOURCE,
      expiresAt: new Date(now.getTime() + 60 * MINUTE),
    });
  });

  it('refuses a missing or wrong PKCE verifier', async () => {
    const code = await approvedCode();
    expect(await exchangeToken(deps, tokenForm(code, { code_verifier: undefined }))).toMatchObject({
      error: 'invalid_request',
    });
    expect(await exchangeToken(deps, tokenForm(code, { code_verifier: 'w'.repeat(43) }))).toMatchObject({
      error: 'invalid_grant',
    });
  });

  it('refuses a redirect URI other than the one approved', async () => {
    const code = await approvedCode();
    expect(
      await exchangeToken(deps, tokenForm(code, { redirect_uri: 'http://localhost:33418/other' })),
    ).toMatchObject({ error: 'invalid_grant' });
  });

  it('refuses a code issued to another client, an unknown client, and an expired code', async () => {
    const other = await registerClient(deps, { redirect_uris: [REDIRECT] });
    if (other.kind !== 'registered') {
      throw new Error('not registered');
    }
    expect(
      await exchangeToken(deps, tokenForm(await approvedCode(), { client_id: other.client.clientId })),
    ).toMatchObject({ error: 'invalid_grant' });
    expect(
      await exchangeToken(deps, tokenForm(await approvedCode(), { client_id: 'unknown' })),
    ).toMatchObject({
      status: 401,
      error: 'invalid_client',
    });
    const code = await approvedCode();
    now = new Date(now.getTime() + MINUTE);
    expect(await exchangeToken(deps, tokenForm(code))).toMatchObject({ error: 'invalid_grant' });
  });

  it('refuses tokens for another resource', async () => {
    expect(
      await exchangeToken(deps, tokenForm(await approvedCode(), { resource: 'https://other.test/mcp' })),
    ).toMatchObject({ error: 'invalid_grant' });
  });

  it('refuses a code used twice, and revokes the tokens the first use gave', async () => {
    const code = await approvedCode();
    const first = await issued(tokenForm(code));
    expect(await exchangeToken(deps, tokenForm(code))).toMatchObject({ error: 'invalid_grant' });
    expect(await verifyAccessToken(deps, first.access_token)).toBeNull();
    expect(
      await exchangeToken(deps, {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: first.refresh_token,
      }),
    ).toMatchObject({ error: 'invalid_grant' });
  });

  it('refuses other grant types', async () => {
    expect(await exchangeToken(deps, { grant_type: 'password', client_id: clientId })).toMatchObject({
      error: 'unsupported_grant_type',
    });
  });
});

describe('exchangeToken with a refresh token', () => {
  const refreshForm = (refreshToken: string, overrides: Record<string, string | undefined> = {}) => ({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    ...overrides,
  });

  it('rotates: new tokens, and the old refresh token cannot be used again', async () => {
    const first = await issued(tokenForm(await approvedCode()));
    const second = await issued(refreshForm(first.refresh_token));
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(await verifyAccessToken(deps, second.access_token)).toMatchObject({ userId: 'user-1' });
  });

  it('revokes the whole family when a rotated refresh token comes back', async () => {
    const first = await issued(tokenForm(await approvedCode()));
    const second = await issued(refreshForm(first.refresh_token));

    expect(await exchangeToken(deps, refreshForm(first.refresh_token))).toMatchObject({
      error: 'invalid_grant',
    });
    expect(await verifyAccessToken(deps, second.access_token)).toBeNull();
    expect(await exchangeToken(deps, refreshForm(second.refresh_token))).toMatchObject({
      error: 'invalid_grant',
    });
  });

  it('refuses a refresh token from another client, and one for another resource', async () => {
    const first = await issued(tokenForm(await approvedCode()));
    const other = await registerClient(deps, { redirect_uris: [REDIRECT] });
    if (other.kind !== 'registered') {
      throw new Error('not registered');
    }
    expect(
      await exchangeToken(deps, refreshForm(first.refresh_token, { client_id: other.client.clientId })),
    ).toMatchObject({ error: 'invalid_grant' });
    expect(
      await exchangeToken(deps, refreshForm(first.refresh_token, { resource: 'https://other.test/mcp' })),
    ).toMatchObject({ error: 'invalid_target' });
  });
});

describe('verifyAccessToken', () => {
  it('accepts a token only until it expires, and nothing that is not a token', async () => {
    const tokens = await issued(tokenForm(await approvedCode()));
    now = new Date(now.getTime() + 60 * MINUTE - 1);
    expect(await verifyAccessToken(deps, tokens.access_token)).not.toBeNull();
    now = new Date(now.getTime() + 1);
    expect(await verifyAccessToken(deps, tokens.access_token)).toBeNull();
    expect(await verifyAccessToken(deps, tokens.refresh_token)).toBeNull();
    expect(await verifyAccessToken(deps, 'garbage')).toBeNull();
  });
});
