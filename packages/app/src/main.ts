// Composition root: wires adapters together and starts the HTTP server.
//   PORT          HTTP port (default 3000)
//   DATABASE_URL  Postgres connection string (required), e.g. postgres://user:password@host:5432/db
//   CHROME_PATH   Chrome or Chromium for PDF export (set in the image); unset: no PDF export
import { serve } from '@hono/node-server';
import { fontsDir, iconsDir, templateCatalog } from '@markup-resume/styles';
import { Hono } from 'hono';
import { createChromeRenderer } from './adapters/chrome-cdp/chrome-renderer.ts';
import { parseMarkup } from './adapters/html-parse5/parse-markup.ts';
import { createHttpApp } from './adapters/http/http-app.ts';
import { createMcpHttpApp } from './adapters/mcp/mcp-http.ts';
import { inspectPdf } from './adapters/poppler/inspect-pdf.ts';
import { openCvStore } from './adapters/storage-pg/open-cv-store.ts';
import { CvChanges } from './app/index.ts';

// --- Configuration ---

const port = Number(process.env['PORT'] ?? 3000);
const chromePath = process.env['CHROME_PATH'];

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}

// --- Storage ---

// CVs and their revisions live in Postgres (ADR-0025), for the local owner until sign-in exists.
const { db, store } = await openCvStore(databaseUrl);

// --- Shared by the adapters ---

const cvChanges = new CvChanges();

// --- Entry points: the HTTP API and the MCP server ---

const { app, close } = createHttpApp(store, cvChanges, {
  fontsDir,
  iconsDir,
  // Chrome runs next to this server and opens the CV from it, over IPv4 like the server listens.
  ...(chromePath && {
    pdf: { renderCv: createChromeRenderer({ chromePath, appUrl: `http://127.0.0.1:${port}` }), inspectPdf },
  }),
});

const mcp = createMcpHttpApp({ store, templates: templateCatalog, parseMarkup, cvChanges });

const root = new Hono();
root.route('/', app);
root.route('/mcp', mcp.app);

// --- Server ---

const server = serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Markup Résumé API on http://localhost:${info.port}`);
});

const shutdown = () => {
  close();
  void mcp.close();
  void db.destroy();
  server.close();
  // server.close() only stops new connections. Open keep-alive ones would still take requests, and the UI's
  // event stream reconnects at once, so the process would never exit.
  if ('closeAllConnections' in server) server.closeAllConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
