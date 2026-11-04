import { templateCatalog } from '@markup-resume/styles';
import { describe, expect, it } from 'vitest';
import type { AccessGrant } from '../../domain/index.ts';
import { InMemoryResumeRepository } from '../../app/testing/in-memory-resume-repository.ts';
import { createMcpHttpApp, type McpAuth, mcpAuthKind } from './mcp-http.ts';

const RESOURCE = 'http://localhost:3000/mcp';
const grant = (overrides: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: 'user-1',
  clientId: 'client-1',
  resource: RESOURCE,
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

/** With OAuth: one valid token, "good", and one issued for another resource, "elsewhere". */
const oauth: McpAuth = {
  kind: 'oauth',
  verifyAccessToken: (token) =>
    Promise.resolve(
      token === 'good'
        ? grant()
        : token === 'elsewhere'
          ? grant({ resource: 'https://other.test/mcp' })
          : null,
    ),
  resource: RESOURCE,
};

function setup(auth: McpAuth = oauth) {
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
    auth,
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

describe('MCP over HTTP in a local run', () => {
  const local = (userId: string | null): McpAuth => ({
    kind: 'local',
    owner: () =>
      Promise.resolve(
        userId ? { kind: 'found', userId } : { kind: 'missing', reason: 'OWNER_GITHUB_ID is not set.' },
      ),
  });

  it('serves a client on this machine for the owner, with no token', async () => {
    const { call, servedFor } = setup(local('owner-1'));
    expect((await call()).status).toBe(200);
    expect(servedFor).toEqual(['owner-1']);
  });

  it('answers 503 with the reason while there is no owner', async () => {
    const response = await setup(local(null)).call();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'mcp-unavailable',
      reason: 'OWNER_GITHUB_ID is not set.',
    });
  });

  it('refuses another host and a web page from another origin', async () => {
    const { call, servedFor } = setup(local('owner-1'));
    expect((await call({ Host: 'evil.test' })).status).toBe(403);
    expect((await call({ Origin: 'https://evil.test' })).status).toBe(403);
    expect(servedFor).toEqual([]);
  });
});

describe('mcpAuthKind', () => {
  it('runs locally on plain http on this machine, with OAuth on https, and refuses anything else', () => {
    expect(mcpAuthKind('http://localhost:3000/mcp')).toBe('local');
    expect(mcpAuthKind('http://127.0.0.1:3000/mcp')).toBe('local');
    expect(mcpAuthKind('https://cv.example.com/mcp')).toBe('oauth');
    expect(() => mcpAuthKind('http://cv.example.com/mcp')).toThrow('must be https');
  });
});
