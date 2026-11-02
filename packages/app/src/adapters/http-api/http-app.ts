import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import {
  ClaudeSessions,
  completeSignIn,
  exportResumePdf,
  readResumeDocument,
  listResumes,
  type PdfExportDependencies,
  resolveSession,
  type ResumeChangeNotifier,
  ResumeChanges,
  type SignInDependencies,
  signOut,
  startSignIn,
  toggleResumePin,
} from '../../app/index.ts';
import type { ResumeRepository, User } from '../../domain/index.ts';

const HEARTBEAT_MS = 25_000;
/** Asset names: a flat file name, so a request can never leave the asset folder. */
const ASSET_NAME = /^[\w-]+\.(woff2|svg)$/;
const ASSET_TYPES = { woff2: 'font/woff2', svg: 'image/svg+xml' } as const;

/**
 * The session cookie (ADR-0027). __Host-: only this host, only over HTTPS (browsers treat http://localhost as
 * secure), path /. HttpOnly keeps it from scripts; SameSite=Lax keeps it off requests that other sites start,
 * except a top-level navigation such as GitHub's redirect back.
 */
const SESSION_COOKIE = '__Host-session';
/** The sign-in state, kept between the redirect to GitHub and the callback. */
const STATE_COOKIE = '__Host-sign-in-state';
const STATE_MAX_AGE_S = 10 * 60;
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;
/** Where the browser lands after a sign-in that did not work; the UI tells the user. */
const SIGN_IN_FAILED = '/?signIn=failed';

/** What the API routes of a signed-in request read: the user, and their resumes and change notifier. */
interface ApiEnv {
  Variables: {
    user: User;
    repository: ResumeRepository;
    resumeChanges: ResumeChangeNotifier;
  };
}

export interface HttpAppDependencies {
  /** One user's resumes: the repository acts for the owner it is made for (ADR-0027). */
  readonly repositoryFor: (ownerId: string) => ResumeRepository;
  readonly resumeChanges: ResumeChanges;
  readonly signIn: SignInDependencies;
  /** The origin the browser opens the app at, e.g. http://localhost:4200; requests that change state come from it. */
  readonly appOrigin: string;
}

export interface HttpAppOptions {
  /** Folders of the style library's fonts and icons, which template styles load by URL (ADR-0007). */
  readonly fontsDir?: string;
  readonly iconsDir?: string;
  /** Printing to PDF and checking it; without it, PDF export answers 501. */
  readonly pdf?: Omit<PdfExportDependencies, 'repository'>;
}

/**
 * Sign-in with GitHub (ADR-0027):
 *   GET  /auth/github                             starts signing in: redirects to GitHub
 *   GET  /auth/github/callback                    GitHub's redirect back: starts a session, sets its cookie
 *   POST /auth/logout                             ends the session
 *
 * Versioned HTTP API (ADR-0011), v1. Every route but fonts and icons needs a session and answers 401 without one:
 *   GET  /api/v1/me                               the signed-in user
 *   GET  /api/v1/resumes                          list of resumes
 *   GET  /api/v1/resumes/:slug/document           the resume's HTML, as stored
 *   GET  /api/v1/resumes/:slug/pdf[?force=1]      the resume printed to PDF and checked (ADR-0009); a PDF with
 *                                                 problems comes back as 422 with the list, unless forced
 *   POST /api/v1/resumes/:slug/pin                pins or unpins the resume
 *   GET  /api/v1/events                           server-sent events: "resume-changed" when one of the user's resumes changes,
 *                                                 "claude-changed" when a Claude session comes, goes or acts
 *   GET  /api/v1/fonts/:file, /api/v1/icons/:file the style library's fonts and icons, used by template styles
 *   GET  /api/v1/claude/sessions                  Claude sessions connected now
 *
 * Returns the app and a close function that stops listening for CV changes and ends open
 * streams, so the HTTP server can shut down without waiting for clients.
 */
export function createHttpApp(
  dependencies: HttpAppDependencies,
  options: HttpAppOptions = {},
): { app: Hono; close: () => void } {
  // One CV change listener and one session registry for all event-stream clients. A CV change goes only to the
  // streams of its owner; Claude's presence goes to every stream.
  const listeners = new Set<{ readonly userId: string; readonly send: (event: string) => void }>();
  const broadcast = (event: string, ownerId?: string) =>
    listeners.forEach((listener) => {
      if (ownerId === undefined || listener.userId === ownerId) {
        listener.send(event);
      }
    });
  const stopListening = dependencies.resumeChanges.onChange((ownerId) =>
    broadcast('resume-changed', ownerId),
  );
  const sessions = new ClaudeSessions();
  sessions.onChange(() => broadcast('claude-changed'));
  const shutdown = new AbortController();

  /** A request that changes state must come from the app's own pages: the CSRF check on top of SameSite. */
  const sameOrigin: MiddlewareHandler = async (c, next) => {
    if (
      c.req.method !== 'GET' &&
      c.req.method !== 'HEAD' &&
      c.req.header('Origin') !== dependencies.appOrigin
    ) {
      return c.json({ error: 'forbidden-origin' }, 403);
    }
    return next();
  };

  const auth = new Hono().basePath('/auth');

  auth.get('/github', (c) => {
    const { state, url } = startSignIn(dependencies.signIn);
    setCookie(c, STATE_COOKIE, state, { ...COOKIE_OPTIONS, maxAge: STATE_MAX_AGE_S });
    return c.redirect(url);
  });

  auth.get('/github/callback', async (c) => {
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, COOKIE_OPTIONS);
    const code = c.req.query('code');
    const state = c.req.query('state');
    // Without a code, the user cancelled on GitHub (error=access_denied) or the request is not GitHub's.
    if (!code || !state) {
      return c.redirect(SIGN_IN_FAILED);
    }
    const result = await completeSignIn(dependencies.signIn, { code, state, expectedState });
    if (result.kind !== 'signed-in') {
      return c.redirect(SIGN_IN_FAILED);
    }
    setCookie(c, SESSION_COOKIE, result.sessionToken, { ...COOKIE_OPTIONS, expires: result.expiresAt });
    return c.redirect('/');
  });

  auth.post('/logout', sameOrigin, async (c) => {
    await signOut(dependencies.signIn, getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
    return c.body(null, 204);
  });

  // Fonts and icons are the same for everyone and load into documents, so they need no session.
  const assets = new Hono().basePath('/api/v1');
  assets.get('/fonts/:file', (c) => serveAsset(c, options.fontsDir, c.req.param('file')));
  assets.get('/icons/:file', (c) => serveAsset(c, options.iconsDir, c.req.param('file')));

  const api = new Hono<ApiEnv>().basePath('/api/v1');

  api.use('*', sameOrigin, async (c, next) => {
    const session = await resolveSession(dependencies.signIn, getCookie(c, SESSION_COOKIE));
    if (!session) {
      return c.json({ error: 'unauthenticated' }, 401);
    }
    c.set('user', session.user);
    c.set('repository', dependencies.repositoryFor(session.user.id));
    c.set('resumeChanges', dependencies.resumeChanges.forOwner(session.user.id));
    return next();
  });

  api.get('/me', (c) => c.json({ name: c.get('user').name }));

  api.get('/resumes', async (c) => c.json(await listResumes(c.get('repository'))));

  api.get('/resumes/:slug/document', async (c) => {
    const result = await readResumeDocument(c.get('repository'), c.req.param('slug'));
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

  api.get('/resumes/:slug/pdf', async (c) => {
    if (!options.pdf) {
      return c.json({ error: 'pdf-unavailable' }, 501);
    }
    const result = await exportResumePdf(
      { repository: c.get('repository'), ...options.pdf },
      c.req.param('slug'),
    );
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

  api.post('/resumes/:slug/pin', async (c) => {
    const result = await toggleResumePin(
      { repository: c.get('repository'), resumeChanges: c.get('resumeChanges') },
      c.req.param('slug'),
    );

    switch (result.kind) {
      case 'invalid-slug':
        return c.json({ error: 'invalid-slug' }, 400);
      case 'not-found':
        return c.json({ error: 'not-found' }, 404);
      case 'toggled':
        return c.json({ pinned: result.pinned }, 200);
    }
  });

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const listener = {
        userId: c.get('user').id,
        send: (event: string) => void stream.writeSSE({ event, data: '{}' }),
      };
      listeners.add(listener);
      stream.onAbort(() => {
        listeners.delete(listener);
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      await keepOpen(stream, shutdown.signal);
      // Returning ends the response; streamSSE closes the stream.
      listeners.delete(listener);
    }),
  );

  api.get('/claude/sessions', (c) => c.json(sessions.list()));

  // Assets go first: their routes answer before the API's session check, which matches every /api/v1 path.
  const app = new Hono();
  app.route('/', auth);
  app.route('/', assets);
  app.route('/', api);

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
