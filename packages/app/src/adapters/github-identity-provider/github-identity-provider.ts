import { z } from 'zod';
import type { IdentifyResult, IdentityProvider } from '../../domain/index.ts';

/** A GitHub request that hangs fails after this long, instead of holding the sign-in forever. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface GitHubIdentityProviderOptions {
  /** From the GitHub OAuth App. Not a secret: it is in every sign-in URL. */
  readonly clientId: string;
  /** From the GitHub OAuth App; lives only in the deployment environment. */
  readonly clientSecret: string;
  /** The callback registered in the OAuth App, e.g. http://localhost:4200/auth/github/callback. */
  readonly redirectUri: string;
}

/** The token response: a token, or an error such as bad_verification_code for an expired or used code. */
const tokenResponse = z.union([z.object({ access_token: z.string() }), z.object({ error: z.string() })]);

/** The fields of GET /user that sign-in uses. name is optional on GitHub; login always exists but can change. */
const userResponse = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

/**
 * The IdentityProvider port on a GitHub OAuth App (ADR-0027). The app asks only for read:user, uses the token for
 * one request to learn who signed in, and drops it.
 */
export function createGitHubIdentityProvider(options: GitHubIdentityProviderOptions): IdentityProvider {
  return {
    name: 'github',

    authorizationUrl(state) {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        scope: 'read:user',
        state,
      }).toString();
      return url.toString();
    },

    async identify(code): Promise<IdentifyResult> {
      const token = tokenResponse.parse(
        await request('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code,
            redirect_uri: options.redirectUri,
          }),
        }),
      );
      if ('error' in token) {
        return { kind: 'rejected' };
      }

      const user = userResponse.parse(
        await request('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token.access_token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }),
      );
      return {
        kind: 'identified',
        identity: {
          provider: 'github',
          providerUserId: String(user.id),
          // Without a profile name, the login is what the user is known by on GitHub.
          name: user.name ?? user.login,
          email: user.email,
        },
      };
    },
  };
}

/** A GitHub request that answered 2xx, as parsed JSON; anything else is an error for the caller. */
async function request(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    // GitHub's API refuses requests without a User-Agent.
    headers: { ...init.headers, 'User-Agent': 'markup-resume' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} to ${new URL(url).pathname}`);
  }
  return response.json();
}
