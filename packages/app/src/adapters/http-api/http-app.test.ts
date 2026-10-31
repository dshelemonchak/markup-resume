import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml } from '../../domain/index.ts';
import { type HttpAppOptions, createHttpApp } from './http-app.ts';
import { ResumeChanges } from '../../app/index.ts';
import { InMemoryResumeRepository } from '../../app/testing/in-memory-resume-repository.ts';

function setup(options?: HttpAppOptions) {
  const resumeChanges = new ResumeChanges();
  const repository = new InMemoryResumeRepository();
  void repository.create({
    slug: 'sample',
    title: 'Sample',
    html: '<html><body>CV</body></html>' as CanonicalResumeHtml,
    template: { name: 'classic', version: '0.0.3' },
    author: 'system',
  });
  const { app, close } = createHttpApp(repository, resumeChanges, options);
  return { app, close, notify: () => resumeChanges.notify('sample') };
}

describe('HTTP API v1', () => {
  it('lists CVs', async () => {
    const response = await setup().app.request('/api/v1/resumes');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { slug: 'sample', title: 'Sample', updatedAt: '2026-10-31T10:00:01.000Z', revision: 1 },
    ]);
  });

  it('serves a document as sandboxed, uncached HTML', async () => {
    const response = await setup().app.request('/api/v1/resumes/sample/document');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toBe('sandbox allow-same-origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('<html><body>CV</body></html>');
  });

  it('answers 400 for a malformed slug and 404 for a missing CV', async () => {
    const { app } = setup();
    expect((await app.request('/api/v1/resumes/Bad_Id/document')).status).toBe(400);
    expect((await app.request('/api/v1/resumes/missing/document')).status).toBe(404);
  });

  it('streams a change event when a CV is written', async () => {
    const { app, notify } = setup();
    const controller = new AbortController();
    const response = await app.request('/api/v1/events', { signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const read = async () => decoder.decode((await reader.read()).value);

    expect(await read()).toContain('event: ready');
    notify();
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
