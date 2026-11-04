import { templateCatalog } from '@markup-resume/styles';
import { describe, expect, it } from 'vitest';
import type { AccessGrant } from '../../domain/index.ts';
import { InMemoryResumeRepository } from '../../app/testing/in-memory-resume-repository.ts';
import { createMcpHttpApp } from './mcp-http.ts';

const RESOURCE = 'http://localhost:3000/mcp';
const grant = (overrides: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: 'user-1',
  clientId: 'client-1',
  resource: RESOURCE,
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

/** The MCP endpoint with one valid token, "good", and one issued for another resource, "elsewhere". */
function setup() {
  const servedFor: string[] = [];
  const { app } = createMcpHttpApp({
    dependenciesFor: (userId) => {
      servedFor.push(userId);
      return {
        repository: new InMemoryResumeRepository(),
        templates: templateCatalog,
        parseHtml: () => {
          throw new Error('not used');
        },
        resumeChanges: { notify: () => undefined },
      };
    },
    verifyAccessToken: (token) =>
      Promise.resolve(
        token === 'good'
          ? grant()
          : token === 'elsewhere'
            ? grant({ resource: 'https://other.test/mcp' })
            : null,
      ),
    resource: RESOURCE,
  });
  const call = (headers: Record<string, string> = {}) =>
    app.request('http://localhost:3000/', {
      method: 'POST',
      headers: {
        Host: 'localhost:3000',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    });
  return { call, servedFor };
}

describe('MCP over HTTP with OAuth', () => {
  it('answers 401 without a token, pointing the client to the resource metadata', async () => {
    const response = await setup().call();
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('refuses an unknown token, and a valid one issued for another resource', async () => {
    const { call, servedFor } = setup();
    expect((await call({ Authorization: 'Bearer forged' })).status).toBe(401);
    expect((await call({ Authorization: 'Bearer elsewhere' })).status).toBe(401);
    expect(servedFor).toEqual([]);
  });

  it("serves a request with a valid token for the token's user", async () => {
    const { call, servedFor } = setup();
    const response = await call({ Authorization: 'Bearer good' });
    expect(response.status).toBe(200);
    expect(servedFor).toEqual(['user-1']);
  });

  it('refuses another host, which a web page reaching this server through DNS rebinding would send', async () => {
    const { call } = setup();
    expect((await call({ Authorization: 'Bearer good', Host: 'evil.test' })).status).toBe(403);
  });
});
