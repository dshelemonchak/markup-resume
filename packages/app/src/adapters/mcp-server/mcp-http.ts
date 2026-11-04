import {
  type AuthInfo,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  OAuthError,
  OAuthErrorCode,
  originValidationResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import type { ResumeDocumentDependencies } from '../../app/index.ts';
import type { AccessGrant } from '../../domain/index.ts';
import { createMcpServer, type McpServerOptions } from './mcp-server.ts';

/**
 * How MCP knows who calls (ADR-0028). Hosted, by an OAuth access token from this app. Run locally, by being on this
 * machine: the Claude apps open sign-in pages only over https, which a local server does not have, so locally MCP
 * acts for the one owner of the machine's database instead.
 */
export type McpAuth =
  | {
      readonly kind: 'oauth';
      /** Who an access token acts for, or null when it is not valid now. */
      readonly verifyAccessToken: (token: string) => Promise<AccessGrant | null>;
      /** The public URL of this endpoint: the resource its tokens must have been issued for (RFC 8707). */
      readonly resource: string;
    }
  | {
      readonly kind: 'local';
      /** The owner named by OWNER_GITHUB_ID, asked on every request, so a first sign-in needs no restart. */
      readonly owner: () => Promise<
        | { readonly kind: 'found'; readonly userId: string }
        | { readonly kind: 'missing'; readonly reason: string }
      >;
    };

export interface McpHttpAppDependencies {
  /** The MCP use cases for one user: their CVs and change notifier, as the HTTP API builds them per request. */
  readonly dependenciesFor: (userId: string) => ResumeDocumentDependencies;
  readonly auth: McpAuth;
}

/** The hosts a local MCP endpoint may run on: this machine only. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Which way MCP authenticates for this endpoint URL: local for plain http on this machine, OAuth for https. Plain
 * http anywhere else would send tokens in the clear, so it is refused rather than guessed.
 */
export function mcpAuthKind(mcpUrl: string): McpAuth['kind'] {
  const url = new URL(mcpUrl);
  if (url.protocol === 'https:') {
    return 'oauth';
  }
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) {
    return 'local';
  }
  throw new Error(`MCP_URL must be https, or http on localhost for a local run: ${mcpUrl}`);
}

/**
 * The MCP server over Streamable HTTP (ADR-0023), mounted by the composition root at /mcp. The SDK's handler builds
 * a fresh server for every request, for the user the request acts for, so nothing is kept between requests and no
 * request sees another user's CVs.
 *  - OAuth: every request needs an access token from this app (ADR-0028); without one it answers 401 with the
 *    WWW-Authenticate challenge that leads the client to sign-in.
 *  - Local: only requests from this machine, for the owner; 503 with the reason while there is none.
 */
export function createMcpHttpApp(
  dependencies: McpHttpAppDependencies,
  options: McpServerOptions = {},
): { app: Hono; close: () => Promise<void> } {
  const handler = createMcpHandler((context) => {
    const userId = context.authInfo?.extra?.['userId'];
    if (typeof userId !== 'string') {
      throw new Error('An MCP request reached the server without a verified user');
    }
    return createMcpServer(dependencies.dependenciesFor(userId), options);
  });
  const authenticate =
    dependencies.auth.kind === 'oauth' ? oauthGate(dependencies.auth) : localGate(dependencies.auth);

  const app = new Hono();

  app.post('/', async (c) => {
    const auth = await authenticate(c.req.raw);
    if (auth instanceof Response) {
      return auth;
    }
    return handler.fetch(c.req.raw, { authInfo: auth });
  });

  return { app, close: handler.close };
}

function oauthGate(
  auth: Extract<McpAuth, { kind: 'oauth' }>,
): (request: Request) => Promise<AuthInfo | Response> {
  const resource = new URL(auth.resource);
  const requireToken = requireBearerAuth({
    verifier: {
      async verifyAccessToken(token) {
        const grant = await auth.verifyAccessToken(token);
        if (!grant) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is invalid or has expired.');
        }
        return {
          token,
          clientId: grant.clientId,
          scopes: [],
          expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
          resource: new URL(grant.resource),
          extra: { userId: grant.userId },
        };
      },
    },
    // A token issued for another resource is refused, even a valid one of ours.
    expectedResource: resource,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
  });
  return async (request) => {
    // Only this endpoint's own host: blocks web pages that reach a local server through DNS rebinding.
    const wrongHost = hostHeaderValidationResponse(request, [
      resource.hostname,
      ...localhostAllowedHostnames(),
    ]);
    if (wrongHost) {
      return wrongHost;
    }
    return requireToken(request);
  };
}

function localGate(
  auth: Extract<McpAuth, { kind: 'local' }>,
): (request: Request) => Promise<AuthInfo | Response> {
  return async (request) => {
    // Only a client on this machine: blocks web pages that reach the local server through DNS rebinding, or from
    // another origin. Other machines are kept out by publishing the port on 127.0.0.1 only (compose.yaml).
    const rejected =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());
    if (rejected) {
      return rejected;
    }
    const owner = await auth.owner();
    if (owner.kind === 'missing') {
      return Response.json({ error: 'mcp-unavailable', reason: owner.reason }, { status: 503 });
    }
    return { token: '', clientId: 'local', scopes: [], extra: { userId: owner.userId } };
  };
}
