import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import type { ResumeDocumentDependencies } from '../../app/index.ts';
import type { AccessGrant } from '../../domain/index.ts';
import { createMcpServer, type McpServerOptions } from './mcp-server.ts';

export interface McpHttpAppDependencies {
  /** The MCP use cases for one user: their CVs and change notifier, as the HTTP API builds them per request. */
  readonly dependenciesFor: (userId: string) => ResumeDocumentDependencies;
  /** Who an access token acts for, or null when it is not valid now. */
  readonly verifyAccessToken: (token: string) => Promise<AccessGrant | null>;
  /** The public URL of this endpoint: the resource its tokens must have been issued for (RFC 8707). */
  readonly resource: string;
}

/**
 * The MCP server over Streamable HTTP (ADR-0023), mounted by the composition root at /mcp. Every request needs an
 * access token from this app's OAuth server (ADR-0028); without one it answers 401 with the WWW-Authenticate
 * challenge that leads the client to sign-in. The SDK's handler builds a fresh server for every request, here for
 * the token's user, so nothing is kept between requests and no request sees another user's CVs.
 */
export function createMcpHttpApp(
  dependencies: McpHttpAppDependencies,
  options: McpServerOptions = {},
): { app: Hono; close: () => Promise<void> } {
  const resource = new URL(dependencies.resource);
  const handler = createMcpHandler((context) => {
    const userId = context.authInfo?.extra?.['userId'];
    if (typeof userId !== 'string') {
      throw new Error('An MCP request reached the server without a verified user');
    }
    return createMcpServer(dependencies.dependenciesFor(userId), options);
  });
  const requireToken = requireBearerAuth({
    verifier: {
      async verifyAccessToken(token) {
        const grant = await dependencies.verifyAccessToken(token);
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

  const app = new Hono();

  app.post('/', async (c) => {
    const request = c.req.raw;
    // Only this endpoint's own host: blocks web pages that reach a local server through DNS rebinding.
    const wrongHost = hostHeaderValidationResponse(request, [
      resource.hostname,
      ...localhostAllowedHostnames(),
    ]);
    if (wrongHost) {
      return wrongHost;
    }
    const auth = await requireToken(request);
    if (auth instanceof Response) {
      return auth;
    }
    return handler.fetch(request, { authInfo: auth });
  });

  return { app, close: handler.close };
}
