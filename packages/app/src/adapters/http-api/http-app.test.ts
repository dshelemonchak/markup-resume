import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, IdentifyResult } from '../../domain/index.ts';
import { type HttpAppOptions, createHttpApp } from './http-app.ts';
import { completeSignIn, ResumeChanges, type SignInDependencies } from '../../app/index.ts';
import { InMemoryResumeRepository } from '../../app/testing/in-memory-resume-repository.ts';
import { InMemorySessionRepository } from '../../app/testing/in-memory-session-repository.ts';
import { InMemoryUserRepository } from '../../app/testing/in-memory-user-repository.ts';

const APP_ORIGIN = 'http://localhost:4200';
/** The document's template has a visual and an ATS version. */
const templates = {
  refs: () => ['classic@0.0.3'],
  styles: (ref: string, variant = 'visual') =>
    ref === 'classic@0.0.3' ? (variant === 'ats' ? '.visual {} .ats {}' : '.visual {}') : null,
  guide: () => null,
  schema: () => null,
};
const ALEX = { provider: 'github', providerUserId: '42', name: 'Alex', email: null } as const;

function setup(options?: HttpAppOptions) {
  const resumeChanges = new ResumeChanges();
  const repository = new InMemoryResumeRepository();
  void repository.create({
    slug: 'sample',
    title: 'Sample',
    html: '<html><head><meta name="resume:template" content="classic@0.0.3"></head><body>CV</body></html>' as CanonicalResumeHtml,
    template: { name: 'classic', version: '0.0.3' },
    author: 'system',
  });
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository(
    (id) => users.byId(id),
    () => new Date(),
  );
  // What GitHub answers to the code; a test can make it refuse or fail.
  const github = {
    identify: (): Promise<IdentifyResult> => Promise.resolve({ kind: 'identified', identity: ALEX }),
  };
  const signIn: SignInDependencies = {
    identityProvider: {
      name: 'github',
      authorizationUrl: (state) => `https://github.test/authorize?state=${state}`,
      identify: () => github.identify(),
    },
    users,
    sessions,
    now: () => new Date(),
  };
  const { app, close } = createHttpApp(
    { repositoryFor: () => repository, resumeChanges, signIn, templates, appOrigin: APP_ORIGIN },
    options,
  );
  // Alex's session, as a finished sign-in leaves it.
  const session = completeSignIn(signIn, { code: 'code', state: 'state', expectedState: 'state' }).then(
    (result) => {
      if (result.kind !== 'signed-in') {
        throw new Error('not signed in');
      }
      return { user: result.user, cookie: `__Host-session=${result.sessionToken}` };
    },
  );
  // Requests as the app's own page sends them: with Alex's session cookie and the app's origin.
  const signedIn = {
    request: async (path: string, init: RequestInit = {}) =>
      app.request(path, {
        ...init,
        headers: {
          Cookie: (await session).cookie,
          Origin: APP_ORIGIN,
          ...(init.headers as Record<string, string> | undefined),
        },
      }),
  };
  return {
    app: signedIn,
    /** Requests with nothing added: no session, no origin. */
    anonymous: app,
    close,
    github,
    session,
    sessions,
    notify: async (ownerId?: string) => resumeChanges.notify(ownerId ?? (await session).user.id, 'sample'),
  };
}

/** The Set-Cookie header for one cookie name. */
function setCookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
}

describe('HTTP API v1', () => {
  it('lists CVs', async () => {
    const response = await setup().app.request('/api/v1/resumes');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { slug: 'sample', title: 'Sample', updatedAt: '2026-10-31T10:00:01.000Z', revision: 1, pinned: false },
    ]);
  });

  it('serves a document as sandboxed, uncached HTML', async () => {
    const response = await setup().app.request('/api/v1/resumes/sample/document');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toBe('sandbox allow-same-origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(
      '<html><head><meta name="resume:template" content="classic@0.0.3"></head><body>CV</body></html>',
    );
  });

  it('serves the same document restyled as ATS, without changing what is stored', async () => {
    const { app } = setup();
    const ats = await (await app.request('/api/v1/resumes/sample/document?mode=ats')).text();
    expect(ats).toContain('<style id="resume-lib" data-resume-lib="classic@0.0.3">');
    expect(ats).toContain('.ats {}');
    expect(ats).toContain('<body>CV</body>');
    expect(await (await app.request('/api/v1/resumes/sample/document')).text()).not.toContain('.ats {}');
  });

  it('answers 400 for a malformed slug and 404 for a missing CV', async () => {
    const { app } = setup();
    expect((await app.request('/api/v1/resumes/Bad_Id/document')).status).toBe(400);
    expect((await app.request('/api/v1/resumes/missing/document')).status).toBe(404);
  });

  it('toggles the pin of a CV and answers with its new state', async () => {
    const { app } = setup();
    const pin = () => app.request('/api/v1/resumes/sample/pin', { method: 'POST' });

    const pinned = await pin();
    expect(pinned.status).toBe(200);
    expect(await pinned.json()).toEqual({ pinned: true });
    expect(await (await pin()).json()).toEqual({ pinned: false });
  });

  it('answers 400 for a malformed slug and 404 for a missing CV when pinning', async () => {
    const { app } = setup();
    expect((await app.request('/api/v1/resumes/Bad_Id/pin', { method: 'POST' })).status).toBe(400);
    expect((await app.request('/api/v1/resumes/missing/pin', { method: 'POST' })).status).toBe(404);
  });

  it('streams a change event when a CV is written', async () => {
    const { app, notify } = setup();
    const controller = new AbortController();
    const response = await app.request('/api/v1/events', { signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const read = async () => decoder.decode((await reader.read()).value);

    expect(await read()).toContain('event: ready');
    await notify();
    expect(await read()).toContain('event: resume-changed');
    controller.abort();
  });

  it('ends open event streams on close', async () => {
    const { app, close } = setup();
    const response = await app.request('/api/v1/events');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // "ready"

    close();
    expect((await reader.read()).done).toBe(true);
  });

  it('serves fonts and icons from their folders, and nothing outside them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resume-assets-'));
    try {
      await writeFile(join(dir, 'email.svg'), '<svg/>');
      await writeFile(join(dir, 'inter.woff2'), 'font');
      // Without a session: documents load them, and the PDF renderer has none.
      const { anonymous: app } = setup({ fontsDir: dir, iconsDir: dir });

      const icon = await app.request('/api/v1/icons/email.svg');
      expect(icon.status).toBe(200);
      expect(icon.headers.get('content-type')).toBe('image/svg+xml');
      expect(icon.headers.get('content-security-policy')).toBe('sandbox');
      expect(await icon.text()).toBe('<svg/>');
      expect((await app.request('/api/v1/fonts/inter.woff2')).headers.get('content-type')).toBe('font/woff2');

      for (const path of [
        '/api/v1/icons/missing.svg',
        '/api/v1/icons/..%2Femail.svg',
        '/api/v1/fonts/x.txt',
      ]) {
        expect((await app.request(path)).status).toBe(404);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('PDF export', () => {
    const pdfOptions = (text: string): HttpAppOptions => ({
      pdf: {
        renderPdf: () =>
          Promise.resolve({
            pdf: new Uint8Array([37, 80, 68, 70]),
            page: { title: 'Alex – CV', blocks: ['Hello world'], links: [] },
          }),
        inspectPdf: () => Promise.resolve({ fonts: [], text, links: [] }),
      },
    });

    it('downloads a PDF that passes the check, named after the title', async () => {
      const response = await setup(pdfOptions('Hello world')).app.request('/api/v1/resumes/sample/pdf');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="Alex _ CV.pdf"; filename*=UTF-8''Alex%20%E2%80%93%20CV.pdf`,
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    });

    it('holds back a PDF with problems, unless forced', async () => {
      const { app } = setup(pdfOptions('Hello'));
      const held = await app.request('/api/v1/resumes/sample/pdf');
      expect(held.status).toBe(422);
      const body = (await held.json()) as { error: string; problems: string[] };
      expect(body.error).toBe('pdf-check-failed');
      expect(body.problems.length).toBeGreaterThan(0);
      expect((await app.request('/api/v1/resumes/sample/pdf?force=1')).status).toBe(200);
    });

    it('answers 404 for a missing CV and 501 when PDF export is not set up', async () => {
      expect((await setup(pdfOptions('')).app.request('/api/v1/resumes/missing/pdf')).status).toBe(404);
      expect((await setup().app.request('/api/v1/resumes/sample/pdf')).status).toBe(501);
    });
  });
});

describe('sessions and the API', () => {
  it('answers 401 to every API route without a session', async () => {
    const { anonymous } = setup();
    for (const [method, path] of [
      ['GET', '/api/v1/user'],
      ['GET', '/api/v1/resumes'],
      ['GET', '/api/v1/resumes/sample/document'],
      ['GET', '/api/v1/resumes/sample/pdf'],
      ['GET', '/api/v1/events'],
      ['GET', '/api/v1/claude/sessions'],
    ] as const) {
      expect((await anonymous.request(path, { method })).status, path).toBe(401);
    }
    const pin = await anonymous.request('/api/v1/resumes/sample/pin', {
      method: 'POST',
      headers: { Origin: APP_ORIGIN },
    });
    expect(pin.status).toBe(401);
  });

  it('answers 401 to a cookie that is not a session', async () => {
    const { app } = setup();
    const response = await app.request('/api/v1/resumes', {
      headers: { Cookie: `__Host-session=${'A'.repeat(43)}` },
    });
    expect(response.status).toBe(401);
  });

  it('names the signed-in user', async () => {
    expect(await (await setup().app.request('/api/v1/user')).json()).toEqual({ name: 'Alex' });
  });

  it('refuses a change from another origin, or with no origin, even with a session', async () => {
    const { app } = setup();
    for (const origin of ['https://evil.test', '']) {
      const response = await app.request('/api/v1/resumes/sample/pin', {
        method: 'POST',
        headers: { Origin: origin },
      });
      expect(response.status, origin).toBe(403);
    }
    expect(await (await app.request('/api/v1/resumes')).json()).toMatchObject([{ pinned: false }]);
  });

  it("does not send one user's changes to another user's event stream", async () => {
    const { app, notify, close } = setup();
    const response = await app.request('/api/v1/events');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // "ready"

    await notify('someone-else');
    close();
    expect((await reader.read()).done).toBe(true);
  });
});

describe('signing in with GitHub', () => {
  /** Starts signing in: the redirect, and the state cookie to send back. */
  async function start(anonymous: ReturnType<typeof setup>['anonymous']) {
    const response = await anonymous.request('/auth/github');
    const cookie = setCookie(response, '__Host-sign-in-state')!;
    const state = new URL(response.headers.get('location')!).searchParams.get('state')!;
    return { response, cookie, state, stateCookie: cookie.split(';')[0]! };
  }

  it('sends the browser to GitHub with a state it also keeps in a cookie', async () => {
    const { response, cookie, state } = await start(setup().anonymous);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`https://github.test/authorize?state=${state}`);
    expect(cookie).toBe(`__Host-sign-in-state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
  });

  it('signs in on the callback: a session cookie that the API accepts, and back to the app', async () => {
    const { anonymous } = setup();
    const { state, stateCookie } = await start(anonymous);
    const callback = await anonymous.request(`/auth/github/callback?code=code&state=${state}`, {
      headers: { Cookie: stateCookie },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
    const session = setCookie(callback, '__Host-session')!;
    expect(session).toMatch(
      /^__Host-session=[A-Za-z0-9_-]{43}; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(setCookie(callback, '__Host-sign-in-state')).toContain('Max-Age=0');

    const user = await anonymous.request('/api/v1/user', { headers: { Cookie: session.split(';')[0]! } });
    expect(await user.json()).toEqual({ name: 'Alex' });
  });

  it('starts no session on a callback with a state this browser did not start', async () => {
    const { anonymous } = setup();
    const { stateCookie } = await start(anonymous);
    const forged = await anonymous.request('/auth/github/callback?code=code&state=forged', {
      headers: { Cookie: stateCookie },
    });
    expect(forged.headers.get('location')).toBe('/?signIn=failed');
    expect(setCookie(forged, '__Host-session')).toBeUndefined();
  });

  it('turns a cancelled, refused or failed sign-in into a failed one for the user, not an error', async () => {
    const { anonymous, github } = setup();
    const callback = async (query: string) => {
      const { state, stateCookie } = await start(anonymous);
      return anonymous.request(`/auth/github/callback?${query.replace('STATE', state)}`, {
        headers: { Cookie: stateCookie },
      });
    };
    expect((await callback('error=access_denied&state=STATE')).headers.get('location')).toBe(
      '/?signIn=failed',
    );

    github.identify = () => Promise.resolve({ kind: 'rejected' });
    expect((await callback('code=used&state=STATE')).headers.get('location')).toBe('/?signIn=failed');

    github.identify = () => Promise.reject(new Error('GitHub answered 502'));
    const failed = await callback('code=code&state=STATE');
    expect(failed.status).toBe(302);
    expect(failed.headers.get('location')).toBe('/?signIn=failed');
  });

  it('signs out on the server: the old cookie no longer works', async () => {
    const { app, anonymous, session } = setup();
    const logout = await app.request('/auth/logout', { method: 'POST' });
    expect(logout.status).toBe(204);
    expect(setCookie(logout, '__Host-session')).toContain('Max-Age=0');
    const user = await anonymous.request('/api/v1/user', { headers: { Cookie: (await session).cookie } });
    expect(user.status).toBe(401);
  });

  it('refuses a sign-out from another origin', async () => {
    const { app } = setup();
    const logout = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://evil.test' },
    });
    expect(logout.status).toBe(403);
  });
});
