import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CvRepository } from '../../domain/index.ts';
import { type HttpAppOptions, createHttpApp } from './http-app.ts';
import { CvChanges } from '../../app/index.ts';

function setup(options?: HttpAppOptions) {
  let notify = () => {};
  const repository: CvRepository = {
    list: () => Promise.resolve([{ id: 'sample', title: 'Sample', updatedAt: '2026-10-27T00:00:00.000Z' }]),
    getDocument: (id) => Promise.resolve(id === 'sample' ? '<html><body>CV</body></html>' : null),
    save: () => Promise.resolve(),
    create: () => Promise.resolve(true),
    watch: (listener) => {
      notify = listener;
      return () => {};
    },
  };
  const { app, close } = createHttpApp(repository, new CvChanges(), options);
  return { app, close, notify: () => notify() };
}

describe('HTTP API v1', () => {
  it('lists CVs', async () => {
    const response = await setup().app.request('/api/v1/cvs');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: 'sample', title: 'Sample', updatedAt: '2026-10-27T00:00:00.000Z' },
    ]);
  });

  it('serves a document as sandboxed, uncached HTML', async () => {
    const response = await setup().app.request('/api/v1/cvs/sample/document');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toBe('sandbox allow-same-origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('<html><body>CV</body></html>');
  });

  it('answers 400 for a malformed id and 404 for a missing CV', async () => {
    const { app } = setup();
    expect((await app.request('/api/v1/cvs/Bad_Id/document')).status).toBe(400);
    expect((await app.request('/api/v1/cvs/missing/document')).status).toBe(404);
  });

  it('tells the UI where the project lives on the host, if known', async () => {
    const known = await setup({ hostProjectDir: '/Users/me/CV' }).app.request('/api/v1/setup');
    expect(await known.json()).toEqual({ hostProjectDir: '/Users/me/CV' });
    const unknown = await setup().app.request('/api/v1/setup');
    expect(await unknown.json()).toEqual({ hostProjectDir: null });
  });

  it('streams a change event when storage changes', async () => {
    const { app, notify } = setup();
    const controller = new AbortController();
    const response = await app.request('/api/v1/events', { signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const read = async () => decoder.decode((await reader.read()).value);

    expect(await read()).toContain('event: ready');
    notify();
    expect(await read()).toContain('event: cvs-changed');
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

  it('serves Markup Résumé as a Claude Desktop extension with the project folder filled in', async () => {
    const response = await setup({ hostProjectDir: '/Users/me/CV' }).app.request(
      '/api/v1/claude/desktop-extension',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="markup-resume.mcpb"');
    // Stored entries, so the manifest is readable in the bytes.
    const bytes = Buffer.from(await response.arrayBuffer()).toString('latin1');
    expect(bytes.startsWith('PK\x03\x04')).toBe(true);
    expect(bytes).toContain('"default": "/Users/me/CV"');
  });

  it('serves fonts and icons from their folders, and nothing outside them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-assets-'));
    try {
      await writeFile(join(dir, 'email.svg'), '<svg/>');
      await writeFile(join(dir, 'inter.woff2'), 'font');
      const { app } = setup({ fontsDir: dir, iconsDir: dir });

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
        renderCv: () =>
          Promise.resolve({
            pdf: new Uint8Array([37, 80, 68, 70]),
            page: { title: 'Alex – CV', blocks: ['Hello world'], links: [] },
          }),
        inspectPdf: () => Promise.resolve({ fonts: [], text, links: [] }),
      },
    });

    it('downloads a PDF that passes the check, named after the title', async () => {
      const response = await setup(pdfOptions('Hello world')).app.request('/api/v1/cvs/sample/pdf');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="Alex _ CV.pdf"; filename*=UTF-8''Alex%20%E2%80%93%20CV.pdf`,
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    });

    it('holds back a PDF with problems, unless forced', async () => {
      const { app } = setup(pdfOptions('Hello'));
      const held = await app.request('/api/v1/cvs/sample/pdf');
      expect(held.status).toBe(422);
      const body = (await held.json()) as { error: string; problems: string[] };
      expect(body.error).toBe('pdf-check-failed');
      expect(body.problems.length).toBeGreaterThan(0);
      expect((await app.request('/api/v1/cvs/sample/pdf?force=1')).status).toBe(200);
    });

    it('answers 404 for a missing CV and 501 when PDF export is not set up', async () => {
      expect((await setup(pdfOptions('')).app.request('/api/v1/cvs/missing/pdf')).status).toBe(404);
      expect((await setup().app.request('/api/v1/cvs/sample/pdf')).status).toBe(501);
    });
  });

  describe('Claude presence', () => {
    async function open(app: ReturnType<typeof setup>['app'], path: string) {
      const response = await app.request(path);
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      await reader.read(); // "ready"
      return reader;
    }

    it('lists a session while its presence connection is open', async () => {
      const { app } = setup();
      const connection = await open(app, '/api/v1/claude/sessions/s1/presence?client=claude-ai&version=1.2');

      expect(await (await app.request('/api/v1/claude/sessions')).json()).toEqual([
        expect.objectContaining({ id: 's1', client: 'claude-ai', version: '1.2', lastActivityAt: null }),
      ]);

      // The MCP server goes away: its end of the connection closes.
      await connection.cancel();
      await vi.waitFor(async () =>
        expect(await (await app.request('/api/v1/claude/sessions')).json()).toEqual([]),
      );
    });

    it('records activity of connected sessions only', async () => {
      const { app } = setup();
      await open(app, '/api/v1/claude/sessions/s1/presence?client=claude-code');

      const post = (id: string) => app.request(`/api/v1/claude/sessions/${id}/activity`, { method: 'POST' });
      expect((await post('s1')).status).toBe(204);
      expect((await post('missing')).status).toBe(404);
      const [session] = (await (await app.request('/api/v1/claude/sessions')).json()) as {
        lastActivityAt: string | null;
      }[];
      expect(session!.lastActivityAt).not.toBeNull();
    });

    it('rejects a malformed session or a missing client', async () => {
      const { app } = setup();
      expect((await app.request('/api/v1/claude/sessions/bad id/presence?client=x')).status).toBe(400);
      expect((await app.request('/api/v1/claude/sessions/s1/presence')).status).toBe(400);
    });

    it('tells event-stream clients when sessions change', async () => {
      const { app } = setup();
      const events = await open(app, '/api/v1/events');
      await open(app, '/api/v1/claude/sessions/s1/presence?client=claude-ai');
      expect(new TextDecoder().decode((await events.read()).value)).toContain('event: claude-changed');
    });
  });
});
