import { setTimeout as sleep } from 'node:timers/promises';
import { Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { ClaudeSessions, getCvDocument, listCvs } from '../../app/index.ts';
import type { CvRepository } from '../../domain/index.ts';
import { desktopExtension } from './desktop-extension.ts';

const HEARTBEAT_MS = 25_000;
const SESSION_ID = /^[\w-]{1,64}$/;
const MAX_CLIENT_LENGTH = 64;

export interface HttpAppOptions {
  /** Project folder on the host, when the server runs in a container; null if unknown. */
  readonly hostProjectDir?: string | null;
}

/**
 * Versioned HTTP API (ADR-0011), v1:
 *   GET  /api/v1/cvs                              list of CVs
 *   GET  /api/v1/cvs/:id/document                 the CV's HTML, as stored
 *   GET  /api/v1/events                           server-sent events: "cvs-changed" when any CV changes,
 *                                                 "claude-changed" when a Claude session comes, goes or acts
 *   GET  /api/v1/setup                            what the UI needs to show how to connect Claude
 *   GET  /api/v1/claude/desktop-extension         cv-kit as a Claude Desktop extension (cv-kit.mcpb)
 *   GET  /api/v1/claude/sessions                  Claude sessions connected now
 *   GET  /api/v1/claude/sessions/:id/presence     held open by the MCP server while Claude is connected
 *        ?client=<clientInfo.name>&version=<clientInfo.version>                         (ADR-0018)
 *   POST /api/v1/claude/sessions/:id/activity     the MCP server reports a tool call
 *
 * Returns the app and a close function that stops watching the storage and ends open
 * streams, so the HTTP server can shut down without waiting for clients.
 */
export function createHttpApp(
  repository: CvRepository,
  options: HttpAppOptions = {},
): { app: Hono; close: () => void } {
  // One storage watcher and one session registry for all event-stream clients.
  const listeners = new Set<(event: string) => void>();
  const broadcast = (event: string) => listeners.forEach((listener) => listener(event));
  const stopWatching = repository.watch(() => broadcast('cvs-changed'));
  const sessions = new ClaudeSessions();
  sessions.onChange(() => broadcast('claude-changed'));
  const shutdown = new AbortController();

  const app = new Hono().basePath('/api/v1');

  app.get('/cvs', async (c) => c.json(await listCvs(repository)));

  app.get('/cvs/:id/document', async (c) => {
    const result = await getCvDocument(repository, c.req.param('id'));
    switch (result.kind) {
      case 'invalid-id':
        return c.json({ error: 'invalid-id' }, 400);
      case 'not-found':
        return c.json({ error: 'not-found' }, 404);
      case 'found':
        return c.html(result.html, 200, {
          // Even when the URL is opened directly, scripts in a CV never run (ADR-0002).
          'Content-Security-Policy': 'sandbox allow-same-origin',
          'Cache-Control': 'no-store',
        });
    }
  });

  app.get('/setup', (c) => c.json({ hostProjectDir: options.hostProjectDir ?? null }));

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const notify = (event: string) => void stream.writeSSE({ event, data: '{}' });
      listeners.add(notify);
      stream.onAbort(() => {
        listeners.delete(notify);
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      await keepOpen(stream, shutdown.signal);
      // Returning ends the response; streamSSE closes the stream.
      listeners.delete(notify);
    }),
  );

  app.get('/claude/desktop-extension', (c) =>
    c.body(desktopExtension(options.hostProjectDir ?? null), 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="cv-kit.mcpb"',
    }),
  );

  app.get('/claude/sessions', (c) => c.json(sessions.list()));

  app.get('/claude/sessions/:id/presence', (c) => {
    const id = c.req.param('id');
    const client = c.req.query('client');
    if (!SESSION_ID.test(id) || !client || client.length > MAX_CLIENT_LENGTH) {
      return c.json({ error: 'invalid-session' }, 400);
    }
    const version = c.req.query('version')?.slice(0, MAX_CLIENT_LENGTH) || null;
    return streamSSE(c, async (stream) => {
      // The session lives exactly as long as this connection.
      const disconnect = sessions.connect(id, client, version);
      stream.onAbort(disconnect);
      await stream.writeSSE({ event: 'ready', data: '{}' });
      await keepOpen(stream, shutdown.signal);
      disconnect();
    });
  });

  app.post('/claude/sessions/:id/activity', (c) =>
    sessions.touch(c.req.param('id')) ? c.body(null, 204) : c.json({ error: 'not-found' }, 404),
  );

  const close = () => {
    shutdown.abort();
    stopWatching();
  };

  return { app, close };
}

/** Pings an open stream until the client leaves or the server shuts down. */
async function keepOpen(stream: SSEStreamingApi, shutdown: AbortSignal): Promise<void> {
  try {
    while (!stream.aborted) {
      // Unlike stream.sleep, this wait ends at once on shutdown.
      await sleep(HEARTBEAT_MS, undefined, { signal: shutdown });
      if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  } catch (error) {
    if (!shutdown.aborted) throw error;
  }
}
