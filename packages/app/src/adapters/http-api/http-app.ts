import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Context, Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import {
  ClaudeSessions,
  ResumeChanges,
  exportResumePdf,
  readResumeDocument,
  listResumes,
  type PdfExportDependencies,
} from '../../app/index.ts';
import type { ResumeRepository } from '../../domain/index.ts';

const HEARTBEAT_MS = 25_000;
/** Asset names: a flat file name, so a request can never leave the asset folder. */
const ASSET_NAME = /^[\w-]+\.(woff2|svg)$/;
const ASSET_TYPES = { woff2: 'font/woff2', svg: 'image/svg+xml' } as const;

export interface HttpAppOptions {
  /** Folders of the style library's fonts and icons, which template styles load by URL (ADR-0007). */
  readonly fontsDir?: string;
  readonly iconsDir?: string;
  /** Printing to PDF and checking it; without it, PDF export answers 501. */
  readonly pdf?: Omit<PdfExportDependencies, 'repository'>;
}

/**
 * Versioned HTTP API (ADR-0011), v1:
 *   GET  /api/v1/resumes                          list of resumes
 *   GET  /api/v1/resumes/:slug/document           the resume's HTML, as stored
 *   GET  /api/v1/resumes/:slug/pdf[?force=1]      the resume printed to PDF and checked (ADR-0009); a PDF with
 *                                                 problems comes back as 422 with the list, unless forced
 *   GET  /api/v1/events                           server-sent events: "resume-changed" when a resume changes,
 *                                                 "claude-changed" when a Claude session comes, goes or acts
 *   GET  /api/v1/fonts/:file, /api/v1/icons/:file the style library's fonts and icons, used by template styles
 *   GET  /api/v1/claude/sessions                  Claude sessions connected now
 *
 * Returns the app and a close function that stops listening for CV changes and ends open
 * streams, so the HTTP server can shut down without waiting for clients.
 */
export function createHttpApp(
  repository: ResumeRepository,
  resumeChanges: ResumeChanges,
  options: HttpAppOptions = {},
): { app: Hono; close: () => void } {
  // One CV change listener and one session registry for all event-stream clients.
  const listeners = new Set<(event: string) => void>();
  const broadcast = (event: string) => listeners.forEach((listener) => listener(event));
  const stopListening = resumeChanges.onChange(() => broadcast('resume-changed'));
  const sessions = new ClaudeSessions();
  sessions.onChange(() => broadcast('claude-changed'));
  const shutdown = new AbortController();

  const app = new Hono().basePath('/api/v1');

  app.get('/resumes', async (c) => c.json(await listResumes(repository)));

  app.get('/resumes/:slug/document', async (c) => {
    const result = await readResumeDocument(repository, c.req.param('slug'));
    switch (result.kind) {
      case 'invalid-slug':
        return c.json({ error: 'invalid-slug' }, 400);
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

  app.get('/resumes/:slug/pdf', async (c) => {
    if (!options.pdf) return c.json({ error: 'pdf-unavailable' }, 501);
    const result = await exportResumePdf({ repository, ...options.pdf }, c.req.param('slug'));
    switch (result.kind) {
      case 'invalid-slug':
        return c.json({ error: 'invalid-slug' }, 400);
      case 'not-found':
        return c.json({ error: 'not-found' }, 404);
      case 'exported':
        if (result.problems.length > 0 && c.req.query('force') !== '1') {
          return c.json({ error: 'pdf-check-failed', problems: result.problems }, 422);
        }
        return c.body(new Uint8Array(result.pdf), 200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': attachment(result.fileName),
          'Cache-Control': 'no-store',
        });
    }
  });

  app.get('/fonts/:file', (c) => serveAsset(c, options.fontsDir, c.req.param('file')));
  app.get('/icons/:file', (c) => serveAsset(c, options.iconsDir, c.req.param('file')));

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

  app.get('/claude/sessions', (c) => c.json(sessions.list()));

  const close = () => {
    shutdown.abort();
    stopListening();
  };

  return { app, close };
}

/** Content-Disposition for a download: an ASCII fallback name, and the real one for browsers that read it. */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** A file from an asset folder, or 404 for a name that is not a plain asset file or does not exist. */
async function serveAsset(c: Context, dir: string | undefined, file: string): Promise<Response> {
  const extension = ASSET_NAME.exec(file)?.[1] as keyof typeof ASSET_TYPES | undefined;
  if (!dir || !extension) return c.json({ error: 'not-found' }, 404);
  try {
    const body = new Uint8Array(await readFile(join(dir, file)));
    return c.body(body, 200, {
      'Content-Type': ASSET_TYPES[extension],
      // An SVG opened on its own is a document; it gets no scripts and no access to the app.
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'no-cache',
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return c.json({ error: 'not-found' }, 404);
    }
    throw error;
  }
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
