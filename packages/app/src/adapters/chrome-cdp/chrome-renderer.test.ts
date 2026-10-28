import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createChromeRenderer } from './chrome-renderer.ts';

// Prints a real page with the Chromium of the image; skipped where there is none (CHROME_PATH unset).
const chromePath = process.env['CHROME_PATH'];

const DOCUMENT_PATH = '/api/v1/cvs/sample/document';
const DOCUMENT = `<!doctype html><html><head><title>Alex – CV</title>
<link rel="stylesheet" href="https://example.com/outside.css"></head>
<body><h1>Alex Morgan</h1><ul><li>One <strong>two</strong></li><li><p>Nested</p></li></ul>
<p><a href="https://example.com/in">example.com/in</a></p></body></html>`;

describe.skipIf(!chromePath)('createChromeRenderer', () => {
  let server: Server;
  let appUrl: string;
  const requested: string[] = [];

  // Stands in for the app's API: serves the one document.
  beforeAll(async () => {
    server = createServer((request, response) => {
      requested.push(request.url ?? '');
      if (request.url === DOCUMENT_PATH) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(DOCUMENT);
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    appUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('prints the CV from the app and snapshots its title, text blocks and links', async () => {
    const { pdf, page } = await createChromeRenderer({ chromePath: chromePath!, appUrl })('sample');
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(page).toEqual({
      title: 'Alex – CV',
      blocks: ['Alex Morgan', 'One two', 'Nested', 'example.com/in'],
      links: [{ href: 'https://example.com/in', text: 'example.com/in' }],
    });
    // The stylesheet from outside never left the browser.
    expect(requested).toEqual([DOCUMENT_PATH]);
  }, 30_000);
});
