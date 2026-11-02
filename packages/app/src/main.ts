// Composition root: wires adapters together and starts the HTTP server.
//   PORT          HTTP port (default 3000)
//   DATABASE_URL  Postgres connection string (required), e.g. postgres://user:password@host:5432/db
//   CHROME_PATH   Chrome or Chromium for PDF export (set in the image); unset: no PDF export
//   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET  the GitHub OAuth App for sign-in (required, ADR-0027)
//   APP_ORIGIN    where the browser opens the app (default http://localhost:4200)
//   OWNER_GITHUB_ID  whose CVs MCP serves until MCP has its own OAuth; unset or unknown: MCP answers 503
import { serve } from '@hono/node-server';
import { fontsDir, iconsDir, templateCatalog } from '@markup-resume/styles';
import { Hono } from 'hono';
import { createChromeRenderer } from './adapters/chrome-pdf-renderer/chrome-renderer.ts';
import { parseHtml } from './adapters/parse5-html-parser/parse-html.ts';
import { createGitHubIdentityProvider } from './adapters/github-identity-provider/github-identity-provider.ts';
import { createHttpApp } from './adapters/http-api/http-app.ts';
import { createMcpHttpApp } from './adapters/mcp-server/mcp-http.ts';
import { inspectPdf } from './adapters/poppler-pdf-inspector/inspect-pdf.ts';
import { connectDatabase } from './adapters/postgres-storage/connect-database.ts';
import { PostgresResumeRepository } from './adapters/postgres-storage/postgres-resume-repository.ts';
import { PostgresSessionRepository } from './adapters/postgres-storage/postgres-session-repository.ts';
import { PostgresUserRepository } from './adapters/postgres-storage/postgres-user-repository.ts';
import { ResumeChanges } from './app/index.ts';
import { findOwner } from './owner.ts';

// --- Configuration ---

const port = Number(process.env['PORT'] ?? 3000);
const chromePath = process.env['CHROME_PATH'];

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set, e.g. postgres://user:password@host:5432/db');
}

const githubClientId = process.env['GITHUB_CLIENT_ID'];
const githubClientSecret = process.env['GITHUB_CLIENT_SECRET'];
if (!githubClientId || !githubClientSecret) {
  throw new Error(
    'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set: create a GitHub OAuth App (see .env.example)',
  );
}
const appOrigin = process.env['APP_ORIGIN'] ?? 'http://localhost:4200';

// --- Storage ---

// CVs and their revisions live in Postgres (ADR-0025), each with its owner: the user who signed in (ADR-0027).
const db = await connectDatabase(databaseUrl);

// --- Shared by the adapters ---

const resumeChanges = new ResumeChanges();

// --- Entry points: the HTTP API and the MCP server ---

const signIn = {
  identityProvider: createGitHubIdentityProvider({
    clientId: githubClientId,
    clientSecret: githubClientSecret,
    redirectUri: `${appOrigin}/auth/github/callback`,
  }),
  users: new PostgresUserRepository(db),
  sessions: new PostgresSessionRepository(db),
  now: () => new Date(),
};

const { app, close } = createHttpApp(
  {
    repositoryFor: (ownerId) => new PostgresResumeRepository(db, ownerId),
    resumeChanges,
    signIn,
    appOrigin,
  },
  {
    fontsDir,
    iconsDir,
    // Chrome runs next to this server and opens the CV from it, over IPv4 like the server listens.
    ...(chromePath && {
      pdf: {
        renderPdf: createChromeRenderer({ chromePath, appUrl: `http://127.0.0.1:${port}` }),
        inspectPdf,
      },
    }),
  },
);

// Until MCP has its own OAuth, it acts for the one user named by OWNER_GITHUB_ID (ADR-0027, temporary).
const mcpOwner = await findOwner(db);
const mcp =
  mcpOwner.kind === 'found'
    ? createMcpHttpApp({
        repository: new PostgresResumeRepository(db, mcpOwner.user.id),
        templates: templateCatalog,
        parseHtml,
        resumeChanges: resumeChanges.forOwner(mcpOwner.user.id),
      })
    : null;
if (mcpOwner.kind === 'missing') {
  console.warn(`MCP is off: ${mcpOwner.reason} Then restart the app.`);
}

const root = new Hono();
root.route('/', app);
if (mcp) {
  root.route('/mcp', mcp.app);
} else if (mcpOwner.kind === 'missing') {
  const reason = mcpOwner.reason;
  root.all('/mcp', (c) => c.json({ error: 'mcp-unavailable', reason }, 503));
}

// --- Server ---

const server = serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Markup Résumé API on http://localhost:${info.port}`);
});

const shutdown = () => {
  close();
  void mcp?.close();
  void db.destroy();
  server.close();
  // server.close() only stops new connections. Open keep-alive ones would still take requests, and the UI's
  // event stream reconnects at once, so the process would never exit.
  if ('closeAllConnections' in server) server.closeAllConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
