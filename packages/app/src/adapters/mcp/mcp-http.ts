import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import type { CvDocumentServices } from '../../app/index.ts';
import { createMcpServer, type McpServerOptions } from './mcp-server.ts';

/**
 * The MCP server over Streamable HTTP (ADR-0023), mounted by the composition root at /mcp. The SDK's handler
 * builds a fresh server from the factory for every request, so nothing is kept between requests.
 */
export function createMcpHttpApp(
  services: CvDocumentServices,
  options: McpServerOptions = {},
): { app: Hono; close: () => Promise<void> } {
  const handler = createMcpHandler(() => createMcpServer(services, options));

  const app = new Hono();

  app.post('/', (c) => {
    const request = c.req.raw;
    // No sign-in yet, so only a local client may call: this blocks web pages that reach localhost through
    // DNS rebinding.
    const rejected =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());
    return rejected ?? handler.fetch(request);
  });

  return { app, close: handler.close };
}
