import { describe, expect, it } from 'vitest';
import type { CvRepository } from '../../domain/index.ts';
import { createHttpApp } from './http-app.ts';

function setup() {
  let notify = () => {};
  const repository: CvRepository = {
    list: () => Promise.resolve([{ id: 'sample', title: 'Sample', updatedAt: '2026-10-27T00:00:00.000Z' }]),
    getDocument: (id) => Promise.resolve(id === 'sample' ? '<html><body>CV</body></html>' : null),
    save: () => Promise.resolve(),
    watch: (listener) => {
      notify = listener;
      return () => {};
    },
  };
  const { app } = createHttpApp(repository);
  return { app, notify: () => notify() };
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
});
