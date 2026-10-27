import { setTimeout as sleep } from 'node:timers/promises';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getCvDocument, listCvs } from '../../app/index.ts';
import type { CvRepository } from '../../domain/index.ts';

const HEARTBEAT_MS = 25_000;

/**
 * Versioned HTTP API (ADR-0011), v1:
 *   GET /api/v1/cvs                 list of CVs
 *   GET /api/v1/cvs/:id/document    the CV's HTML, as stored
 *   GET /api/v1/events              server-sent events: "cvs-changed" when any CV changes
 *
 * Returns the app and a close function that stops watching the storage and ends open
 * event streams, so the HTTP server can shut down without waiting for clients.
 */
export function createHttpApp(repository: CvRepository): { app: Hono; close: () => void } {
  // One storage watcher for all event-stream clients.
  const listeners = new Set<() => void>();
  const stopWatching = repository.watch(() => listeners.forEach((listener) => listener()));
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

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const notify = () => void stream.writeSSE({ event: 'cvs-changed', data: '{}' });
      listeners.add(notify);
      stream.onAbort(() => {
        listeners.delete(notify);
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      try {
        while (!stream.aborted) {
          // Unlike stream.sleep, this wait ends at once on shutdown.
          await sleep(HEARTBEAT_MS, undefined, { signal: shutdown.signal });
          if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '{}' });
        }
      } catch (error) {
        if (!shutdown.signal.aborted) throw error;
      }
      // Returning ends the response; streamSSE closes the stream.
      listeners.delete(notify);
    }),
  );

  const close = () => {
    shutdown.abort();
    stopWatching();
  };

  return { app, close };
}
