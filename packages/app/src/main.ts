// Composition root: wires adapters together and starts the HTTP server.
//   CV_DATA_DIR  data directory (default ./data); CVs live in <dir>/cvs/<id>/document.html
//   PORT         HTTP port (default 3000)
//   CHROME_PATH  Chrome or Chromium for PDF export (set in the image); unset: no PDF export
import { fontsDir, iconsDir, templateCatalog } from '@markup-resume/styles';
import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createChromeRenderer } from './adapters/chrome-cdp/chrome-renderer.ts';
import { createHttpApp } from './adapters/http/http-app.ts';
import { inspectPdf } from './adapters/poppler/inspect-pdf.ts';
import { FsCvRepository } from './adapters/storage-fs/fs-cv-repository.ts';
import { CvChanges } from './app/index.ts';
import { Hono } from 'hono';
import { createMcpHttpApp } from './adapters/mcp/mcp-http.ts';
import { parseMarkup } from './adapters/html-parse5/parse-markup.ts';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const port = Number(process.env['PORT'] ?? 3000);

const chromePath = process.env['CHROME_PATH'];

const repository = new FsCvRepository(dataDir);
await repository.init();

const cvChanges = new CvChanges();

const { app, close } = createHttpApp(repository, cvChanges, {
  fontsDir,
  iconsDir,
  // Chrome runs next to this server and opens the CV from it, over IPv4 like the server listens.
  ...(chromePath && {
    pdf: { renderCv: createChromeRenderer({ chromePath, appUrl: `http://127.0.0.1:${port}` }), inspectPdf },
  }),
});

// MCP
const mcp = createMcpHttpApp({ repository, templates: templateCatalog, parseMarkup, cvChanges });

const root = new Hono();
root.route('/', app);
root.route('/mcp', mcp.app);

const server = serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Markup Résumé API on http://localhost:${info.port} · data: ${dataDir}`);
});

const shutdown = () => {
  close();
  void mcp.close();
  server.close();
  // server.close() only stops new connections. Open keep-alive ones would still take requests, and the MCP servers'
  // presence connections and the UI's event stream reconnect at once, so the process would never exit.
  if ('closeAllConnections' in server) server.closeAllConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
