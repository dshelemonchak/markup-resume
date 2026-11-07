import { type OAuthMetadata, oauthMetadataResponse } from '@modelcontextprotocol/server';
import { type Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { html } from 'hono/html';
import {
  approveAuthorization,
  type AuthorizationRequest,
  checkAuthorizationRequest,
  denyAuthorization,
  exchangeToken,
  type OAuthDependencies,
  type OAuthFailure,
  registerClient,
  resolveSession,
  type SignInDependencies,
} from '../../app/index.ts';
import { SESSION_COOKIE, sameOrigin } from './cookies.ts';
import { rateLimit, type RateLimitRule } from './rate-limit.ts';

export interface OAuthAppDependencies {
  readonly oauth: OAuthDependencies;
  readonly signIn: Pick<SignInDependencies, 'sessions' | 'now'>;
  /** Where the browser opens the app; the issuer and every endpoint live under it. */
  readonly appOrigin: string;
  /** Who sends a request, for the rate limits: the remote address. */
  readonly clientAddress: (c: Context) => string;
}

const MINUTE = 60 * 1000;
/** Registration is open to anyone, so one address may register only a few clients an hour. */
const REGISTER_LIMIT: RateLimitRule = { limit: 10, windowMs: 60 * MINUTE };
/** A client exchanges a code or refreshes about once an hour; this leaves room and stops guessing at speed. */
const TOKEN_LIMIT: RateLimitRule = { limit: 60, windowMs: MINUTE };

/** The parameters of an authorisation request, carried from the query to the consent form and back. */
const AUTHORIZATION_PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'resource',
  'scope',
] as const;

/**
 * The OAuth 2.1 authorisation server for MCP (ADR-0028):
 *   GET  /.well-known/oauth-protected-resource/mcp   resource metadata (RFC 9728)
 *   GET  /.well-known/oauth-authorization-server      authorisation server metadata (RFC 8414)
 *   POST /oauth/register                              dynamic client registration (RFC 7591)
 *   GET  /oauth/authorize                             checks the request; sign-in, then the consent page
 *   POST /oauth/authorize                             the user's answer on the consent page
 *   POST /oauth/token                                 codes and refresh tokens for tokens
 * Registration and the token endpoint are rate-limited per remote address.
 */
export function createOAuthApp(dependencies: OAuthAppDependencies): Hono {
  const { oauth, appOrigin } = dependencies;
  const metadata: OAuthMetadata = {
    issuer: oauth.issuer,
    authorization_endpoint: `${appOrigin}/oauth/authorize`,
    token_endpoint: `${appOrigin}/oauth/token`,
    registration_endpoint: `${appOrigin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
  const metadataOptions = {
    oauthMetadata: metadata,
    resourceServerUrl: new URL(oauth.resource),
    resourceName: 'Markup Résumé',
  };

  const limitBy = { clientKey: dependencies.clientAddress };

  const app = new Hono();

  app.all('/.well-known/*', (c) => oauthMetadataResponse(c.req.raw, metadataOptions) ?? c.notFound());

  app.post('/oauth/register', rateLimit(REGISTER_LIMIT, limitBy), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return oauthError(c, {
        kind: 'error',
        status: 400,
        error: 'invalid_client_metadata',
        description: 'Send JSON.',
      });
    }
    const result = await registerClient(oauth, body);
    if (result.kind === 'error') {
      return oauthError(c, result);
    }
    return c.json(
      {
        client_id: result.client.clientId,
        client_id_issued_at: Math.floor(result.issuedAt.getTime() / 1000),
        client_name: result.client.clientName ?? undefined,
        redirect_uris: result.client.redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  });

  app.get('/oauth/authorize', async (c) => {
    const params = pick(c.req.query());
    const checked = await checkAuthorizationRequest(oauth, params);
    if (checked.kind !== 'valid') {
      return answerInvalid(c, checked);
    }
    const session = await resolveSession(dependencies.signIn, getCookie(c, SESSION_COOKIE));
    if (!session) {
      // Sign in with GitHub first, then come back to this same request.
      const back = `/oauth/authorize?${new URLSearchParams(definedOnly(params)).toString()}`;
      return c.redirect(`/auth/github?${new URLSearchParams({ returnTo: back }).toString()}`);
    }
    return consentPage(c, checked.request, params, session.user.name);
  });

  app.post('/oauth/authorize', sameOrigin(appOrigin), async (c) => {
    const form = await c.req.parseBody();
    const params = pick(stringsOnly(form));
    // The form repeats the request: check it all again, never trust the hidden fields.
    const checked = await checkAuthorizationRequest(oauth, params);
    if (checked.kind !== 'valid') {
      return answerInvalid(c, checked);
    }
    const session = await resolveSession(dependencies.signIn, getCookie(c, SESSION_COOKIE));
    if (!session) {
      return errorPage(c, 401, 'Your session ended. Start connecting again from your MCP client.');
    }
    const location =
      form['decision'] === 'allow'
        ? await approveAuthorization(oauth, checked.request, session.user.id)
        : denyAuthorization(oauth, checked.request);
    return c.redirect(location, 302);
  });

  app.post('/oauth/token', rateLimit(TOKEN_LIMIT, limitBy), async (c) => {
    const form = stringsOnly(await c.req.parseBody());
    const result = await exchangeToken(oauth, form);
    if (result.kind === 'error') {
      return oauthError(c, result);
    }
    return c.json(result.tokens, 200, { 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  });

  return app;
}

function answerInvalid(
  c: Context,
  checked:
    | { readonly kind: 'invalid-client' }
    | { readonly kind: 'invalid-redirect-uri' }
    | { readonly kind: 'redirect'; readonly location: string },
): Response | Promise<Response> {
  switch (checked.kind) {
    case 'invalid-client':
      return errorPage(c, 400, 'This app is not registered here. Connect again from your MCP client.');
    case 'invalid-redirect-uri':
      return errorPage(
        c,
        400,
        'The address to return to does not belong to this app, so nothing was sent to it.',
      );
    case 'redirect':
      return c.redirect(checked.location, 302);
  }
}

function oauthError(c: Context, failure: OAuthFailure): Response {
  return c.json({ error: failure.error, error_description: failure.description }, failure.status, {
    'Cache-Control': 'no-store',
  });
}

/**
 * Headers for the pages of the authorisation server: never framed (clickjacking), never cached. The consent form
 * posts to this app, which redirects to the client: browsers apply form-action to that redirect too, so the
 * client's origin is allowed as well.
 */
function pageHeaders(formTarget?: string): Record<string, string> {
  const formAction = formTarget ? `'self' ${new URL(formTarget).origin}` : "'none'";
  return {
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'`,
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    // Not no-referrer: with it, browsers send Origin: null on the consent form's POST, which the Origin check
    // refuses. same-origin keeps the real Origin there and sends no referrer to other sites.
    'Referrer-Policy': 'same-origin',
  };
}

function consentPage(
  c: Context,
  request: AuthorizationRequest,
  params: Readonly<Record<string, string | undefined>>,
  userName: string | null,
): Response | Promise<Response> {
  const clientName = request.client.clientName ?? 'An MCP client';
  const host = new URL(request.redirectUri).host;
  const hidden = Object.entries(definedOnly(params)).map(
    ([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`,
  );
  return c.html(
    page(
      'Connect to Markup Résumé',
      html`<h1>Connect ${clientName}?</h1>
        <p>
          <strong>${clientName}</strong> wants to read and edit your CVs in Markup
          Résumé${userName ? html` as ${userName}` : ''}.
        </p>
        <p class="note">Allowing sends you back to <code>${host}</code>.</p>
        <form method="post" action="/oauth/authorize">
          ${hidden}
          <button type="submit" name="decision" value="allow" class="primary">Allow</button>
          <button type="submit" name="decision" value="deny">Deny</button>
        </form>`,
    ),
    200,
    pageHeaders(request.redirectUri),
  );
}

function errorPage(c: Context, status: 400 | 401, message: string): Response | Promise<Response> {
  return c.html(
    page(
      'Cannot connect',
      html`<h1>Cannot connect</h1>
        <p>${message}</p>`,
    ),
    status,
    pageHeaders(),
  );
}

function page(title: string, body: ReturnType<typeof html>) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body {
            font:
              15px/1.5 system-ui,
              sans-serif;
            max-width: 30rem;
            margin: 15vh auto;
            padding: 0 1rem;
            color: #222;
          }
          .note {
            color: #666;
            font-size: 13px;
          }
          button {
            font: inherit;
            padding: 0.4rem 1rem;
            margin-right: 0.5rem;
            border-radius: 6px;
            border: 1px solid #ccc;
            background: #fff;
            cursor: pointer;
          }
          button.primary {
            background: #0d6efd;
            border-color: #0d6efd;
            color: #fff;
          }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;
}

/** The authorisation parameters out of a query or form, each a string or absent. */
function pick(values: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  return Object.fromEntries(AUTHORIZATION_PARAMS.map((name) => [name, values[name]]));
}

function definedOnly(values: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/** A parsed form with its file fields and repeated fields dropped. */
function stringsOnly(form: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(form).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}
