// Composition root: wires adapters together and starts the HTTP server.
//   PORT          HTTP port (default 3000)
//   DATABASE_URL  Postgres connection string (required), e.g. postgres://user:password@host:5432/db
//   CHROME_PATH   Chrome or Chromium for PDF export (set in the image); unset: no PDF export
import { serve } from '@hono/node-server';
import { fontsDir, iconsDir, templateCatalog } from '@markup-resume/styles';
import { Hono } from 'hono';
import { createChromeRenderer } from './adapters/chrome-pdf-renderer/chrome-renderer.ts';
import { parseHtml } from './adapters/parse5-html-parser/parse-html.ts';
import { createHttpApp } from './adapters/http-api/http-app.ts';
import { createMcpHttpApp } from './adapters/mcp-server/mcp-http.ts';
import { inspectPdf } from './adapters/poppler-pdf-inspector/inspect-pdf.ts';
import { connectResumeRepository } from './adapters/postgres-storage/connect-resume-repository.ts';
import { ResumeChanges } from './app/index.ts';

// --- Configuration ---

const port = Number(process.env['PORT'] ?? 3000);
const chromePath = process.env['CHROME_PATH'];

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}

// --- Storage ---

// CVs and their revisions live in Postgres (ADR-0025), for the local owner until sign-in exists.
const { db, repository } = await connectResumeRepository(databaseUrl);

// --- Shared by the adapters ---

const resumeChanges = new ResumeChanges();

// --- Entry points: the HTTP API and the MCP server ---

const { app, close } = createHttpApp(repository, resumeChanges, {
  fontsDir,
  iconsDir,
  // Chrome runs next to this server and opens the CV from it, over IPv4 like the server listens.
  ...(chromePath && {
    pdf: { renderPdf: createChromeRenderer({ chromePath, appUrl: `http://127.0.0.1:${port}` }), inspectPdf },
  }),
});

const mcp = createMcpHttpApp({ repository, templates: templateCatalog, parseHtml, resumeChanges });

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
