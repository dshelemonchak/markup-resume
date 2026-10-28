import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PresenceReporter, reportPresence } from './presence-reporter.ts';

/** A stand-in for the app: records requests and keeps presence connections open. */
async function fakeApp() {
  const requests: string[] = [];
  const open = new Set<ServerResponse>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url?.includes('/presence')) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('event: ready\ndata: {}\n\n');
      open.add(response);
      request.on('close', () => open.delete(response));
    } else {
      response.writeHead(204).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    open,
    /** The app restarts: every presence connection is cut. */
    dropAll: () => open.forEach((response) => response.destroy()),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let reporter: PresenceReporter | undefined;
afterEach(() => reporter?.stop());

describe('reportPresence', () => {
  it('holds a presence connection with the client info and reports activity', async () => {
    const app = await fakeApp();
    reporter = reportPresence({ appUrl: app.url, sessionId: 's1', client: 'claude-ai', version: '1.2' });

    await vi.waitFor(() => expect(app.open.size).toBe(1));
    expect(app.requests).toEqual(['GET /api/v1/claude/sessions/s1/presence?client=claude-ai&version=1.2']);

    reporter.activity();
    await vi.waitFor(() => expect(app.requests).toContain('POST /api/v1/claude/sessions/s1/activity'));

    reporter.stop();
    await vi.waitFor(() => expect(app.open.size).toBe(0));
    await app.close();
  });

  it('reconnects when the app drops the connection', async () => {
    const app = await fakeApp();
    reporter = reportPresence({
      appUrl: app.url,
      sessionId: 's1',
      client: 'claude-code',
      version: null,
      retryDelaysMs: [10],
    });
    await vi.waitFor(() => expect(app.open.size).toBe(1));

    app.dropAll();
    await vi.waitFor(() => expect(app.requests.filter((r) => r.includes('/presence'))).toHaveLength(2));
    await vi.waitFor(() => expect(app.open.size).toBe(1));
    reporter.stop();
    await app.close();
  });

  it('keeps trying quietly while the app is down', async () => {
    reporter = reportPresence({
      appUrl: 'http://127.0.0.1:9',
      sessionId: 's1',
      client: 'claude-ai',
      version: null,
      retryDelaysMs: [10],
    });
    reporter.activity();
    await new Promise((resolve) => setTimeout(resolve, 50));
    reporter.stop();
  });
});
