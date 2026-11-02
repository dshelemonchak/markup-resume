import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubIdentityProvider } from './github-identity-provider.ts';

const provider = createGitHubIdentityProvider({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:4200/auth/github/callback',
});

/** Stands in for GitHub: answers the token exchange and GET /user, and records what was asked. */
function fakeGitHub(answers: { token: unknown; user?: unknown; userStatus?: number }) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url === 'https://github.com/login/oauth/access_token') {
      return Promise.resolve(Response.json(answers.token));
    }
    return Promise.resolve(Response.json(answers.user ?? {}, { status: answers.userStatus ?? 200 }));
  });
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe('GitHub identity provider', () => {
  it('sends the browser to GitHub with the app, the callback, read:user and the state', () => {
    const url = new URL(provider.authorizationUrl('state-1'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: 'http://localhost:4200/auth/github/callback',
      scope: 'read:user',
      state: 'state-1',
    });
  });

  it('exchanges the code, reads who signed in once, and names them by their profile name or login', async () => {
    const requests = fakeGitHub({
      token: { access_token: 'gho_token', token_type: 'bearer' },
      user: { id: 42, login: 'alex', name: null, email: null },
    });
    expect(await provider.identify('code-1')).toEqual({
      kind: 'identified',
      identity: { provider: 'github', providerUserId: '42', name: 'alex', email: null },
    });
    expect(JSON.parse(requests[0]!.init.body as string)).toMatchObject({
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'code-1',
    });
    expect(requests[1]!.url).toBe('https://api.github.com/user');
    expect((requests[1]!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer gho_token');
    expect(requests).toHaveLength(2);
  });

  it('turns a refused code into a rejected sign-in, without reading the user', async () => {
    const requests = fakeGitHub({ token: { error: 'bad_verification_code' } });
    expect(await provider.identify('used-code')).toEqual({ kind: 'rejected' });
    expect(requests).toHaveLength(1);
  });

  it('fails on an answer it cannot trust, so the caller does not sign anyone in', async () => {
    fakeGitHub({ token: { access_token: 't' }, userStatus: 502 });
    await expect(provider.identify('code')).rejects.toThrow('GitHub answered 502');
    fakeGitHub({ token: { access_token: 't' }, user: { login: 'no-id' } });
    await expect(provider.identify('code')).rejects.toThrow();
  });
});
