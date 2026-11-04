import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemoryOAuthClientRepository,
  InMemoryOAuthGrantRepository,
} from '../../app/testing/in-memory-oauth.ts';
import { InMemorySessionRepository } from '../../app/testing/in-memory-session-repository.ts';
import { newSessionToken } from '../../app/sign-in/session-token.ts';
import { verifyAccessToken } from '../../app/index.ts';
import { createOAuthApp } from './oauth-app.ts';

const APP_ORIGIN = 'http://localhost:4200';
const RESOURCE = 'http://localhost:3000/mcp';
const REDIRECT = 'http://localhost:33418/callback';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const ALEX = { id: 'user-1', name: 'Alex' };

async function setup() {
  const clients = new InMemoryOAuthClientRepository();
  const oauth = {
    clients,
    grants: new InMemoryOAuthGrantRepository(clients),
    resource: RESOURCE,
    issuer: APP_ORIGIN,
    now: () => new Date(),
  };
  const sessions = new InMemorySessionRepository(
    () => ALEX,
    () => new Date(),
  );
  const { token, hash } = newSessionToken();
  await sessions.create({ userId: ALEX.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000) });
  const app = createOAuthApp({ oauth, signIn: { sessions, now: () => new Date() }, appOrigin: APP_ORIGIN });

  const register = (body: unknown) =>
    app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const registered = (await (
    await register({ client_name: 'Claude Code', redirect_uris: [REDIRECT] })
  ).json()) as {
    client_id: string;
  };
  const params = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      response_type: 'code',
      client_id: registered.client_id,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      state: 'client-state',
      resource: RESOURCE,
      ...overrides,
    });
  const signedIn = { Cookie: `__Host-session=${token}` };
  /** The consent form's answer, as the browser posts it from the app's page. */
  const decide = (
    decision: string,
    overrides: Record<string, string> = {},
    headers: Record<string, string> = {},
  ) =>
    app.request('/oauth/authorize', {
      method: 'POST',
      headers: {
        ...signedIn,
        Origin: APP_ORIGIN,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams({ ...Object.fromEntries(params(overrides)), decision }).toString(),
    });
  const token_ = (form: Record<string, string>) =>
    app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  return { app, oauth, clientId: registered.client_id, register, params, signedIn, decide, token: token_ };
}

describe('OAuth discovery', () => {
  it('describes the protected resource and this authorisation server', async () => {
    const { app } = await setup();
    expect(await (await app.request('/.well-known/oauth-protected-resource/mcp')).json()).toMatchObject({
      resource: RESOURCE,
      authorization_servers: [APP_ORIGIN],
    });
    expect(await (await app.request('/.well-known/oauth-authorization-server')).json()).toMatchObject({
      issuer: APP_ORIGIN,
      authorization_endpoint: `${APP_ORIGIN}/oauth/authorize`,
      token_endpoint: `${APP_ORIGIN}/oauth/token`,
      registration_endpoint: `${APP_ORIGIN}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });
});

describe('client registration', () => {
  it('registers a public client', async () => {
    const response = await (await setup()).register({ redirect_uris: [REDIRECT] });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      client_id: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) as unknown,
      token_endpoint_auth_method: 'none',
      redirect_uris: [REDIRECT],
    });
  });

  it('answers an OAuth error to a redirect URI it does not allow, or to a body that is not JSON', async () => {
    const { app, register } = await setup();
    const bad = await register({ redirect_uris: ['http://evil.test/cb'] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_redirect_uri' });
    const notJson = await app.request('/oauth/register', { method: 'POST', body: 'x' });
    expect(await notJson.json()).toMatchObject({ error: 'invalid_client_metadata' });
  });
});

describe('the authorise step', () => {
  it('sends a signed-out browser through GitHub sign-in and back to the same request', async () => {
    const { app, params } = await setup();
    const response = await app.request(`/oauth/authorize?${params().toString()}`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!, APP_ORIGIN);
    expect(location.pathname).toBe('/auth/github');
    expect(location.searchParams.get('returnTo')).toBe(`/oauth/authorize?${params().toString()}`);
  });

  it('asks the signed-in user, on a page no other site can frame, with the client name escaped', async () => {
    const { app, register, signedIn } = await setup();
    const evil = (await (
      await register({ client_name: '<script>alert(1)</script>', redirect_uris: [REDIRECT] })
    ).json()) as { client_id: string };
    const response = await app.request(
      `/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: evil.client_id,
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
      }).toString()}`,
      { headers: signedIn },
    );
    const page = await response.text();
    expect(response.status).toBe(200);
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).not.toContain('<script>');
    expect(page).toContain('as Alex');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    // With no-referrer, the browser would post the consent form with Origin: null, and the Origin check would refuse it.
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    // The form's redirect to the client must not be blocked by form-action.
    expect(response.headers.get('content-security-policy')).toContain(
      "form-action 'self' http://localhost:33418",
    );
  });

  it('shows an error page, and redirects nowhere, for an unknown client or a foreign redirect URI', async () => {
    const { app, params, signedIn } = await setup();
    for (const overrides of [{ client_id: 'unknown' }, { redirect_uri: 'https://evil.test/callback' }]) {
      const response = await app.request(`/oauth/authorize?${params(overrides).toString()}`, {
        headers: signedIn,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('gives the client a code when the user allows, and an error when they deny', async () => {
    const { decide } = await setup();
    const allowed = new URL((await decide('allow')).headers.get('location')!);
    expect(allowed.origin + allowed.pathname).toBe(REDIRECT);
    expect(allowed.searchParams.get('code')).toBeTruthy();
    expect(allowed.searchParams.get('state')).toBe('client-state');
    expect(allowed.searchParams.get('iss')).toBe(APP_ORIGIN);

    const denied = new URL((await decide('deny')).headers.get('location')!);
    expect(denied.searchParams.get('error')).toBe('access_denied');
  });

  it('refuses an answer posted from another site, or without a session, or with a changed redirect URI', async () => {
    const { decide } = await setup();
    expect((await decide('allow', {}, { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await decide('allow', {}, { Cookie: '' })).status).toBe(401);
    const changed = await decide('allow', { redirect_uri: 'https://evil.test/callback' });
    expect(changed.status).toBe(400);
    expect(changed.headers.get('location')).toBeNull();
  });
});

describe('the token endpoint', () => {
  it('exchanges the code for tokens that MCP accepts, never cached', async () => {
    const { decide, token, clientId, oauth } = await setup();
    const code = new URL((await decide('allow')).headers.get('location')!).searchParams.get('code')!;
    const response = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const tokens = (await response.json()) as {
      access_token: string;
      token_type: string;
      refresh_token: string;
    };
    expect(tokens.token_type).toBe('Bearer');
    expect(await verifyAccessToken(oauth, tokens.access_token)).toMatchObject({ userId: 'user-1', clientId });
  });

  it('answers OAuth errors: 401 for an unknown client, 400 for a bad grant', async () => {
    const { token, clientId } = await setup();
    const unknownClient = await token({ grant_type: 'authorization_code', client_id: 'unknown', code: 'x' });
    expect(unknownClient.status).toBe(401);
    expect(await unknownClient.json()).toMatchObject({ error: 'invalid_client' });
    const badCode = await token({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: 'x',
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    });
    expect(badCode.status).toBe(400);
    expect(await badCode.json()).toMatchObject({ error: 'invalid_grant' });
  });
});
