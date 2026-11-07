// Composition root: wires adapters together and starts the HTTP server.
//   PORT          HTTP port (default 3000)
//   DATABASE_URL  Postgres connection string (required), e.g. postgres://user:password@host:5432/db
//   CHROME_PATH   Chrome or Chromium for PDF export (set in the image); unset: no PDF export
//   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET  the GitHub OAuth App for sign-in (required, ADR-0027)
//   ALLOWED_GITHUB_IDS  comma-separated GitHub user ids that may sign in; unset: anyone (required with an https
//                 MCP_URL, so a hosted app is never open to every GitHub account)
//   APP_ORIGIN    where the browser opens the app (default http://localhost:4200)
//   MCP_URL       the public URL of the MCP endpoint (default http://localhost:<PORT>/mcp, ADR-0028).
//                 https: MCP needs OAuth tokens from this app. http on localhost: a local run, where MCP
//                 serves only this machine and acts for OWNER_GITHUB_ID.
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { fontsDir, iconsDir, templateCatalog } from '@markup-resume/styles';
import { Hono } from 'hono';
import { createChromeRenderer } from './adapters/chrome-pdf-renderer/chrome-renderer.ts';
import { parseHtml } from './adapters/parse5-html-parser/parse-html.ts';
import { createGitHubIdentityProvider } from './adapters/github-identity-provider/github-identity-provider.ts';
import { createHttpApp } from './adapters/http-api/http-app.ts';
import { createOAuthApp } from './adapters/http-api/oauth-app.ts';
import { createMcpHttpApp, type McpAuth, mcpAuthKind } from './adapters/mcp-server/mcp-http.ts';
import { inspectPdf } from './adapters/poppler-pdf-inspector/inspect-pdf.ts';
import { connectDatabase, isDatabaseReachable } from './adapters/postgres-storage/connect-database.ts';
import { PostgresOAuthClientRepository } from './adapters/postgres-storage/postgres-oauth-client-repository.ts';
import { PostgresOAuthGrantRepository } from './adapters/postgres-storage/postgres-oauth-grant-repository.ts';
import { PostgresResumeRepository } from './adapters/postgres-storage/postgres-resume-repository.ts';
import { PostgresSessionRepository } from './adapters/postgres-storage/postgres-session-repository.ts';
import { PostgresUserRepository } from './adapters/postgres-storage/postgres-user-repository.ts';
import { purgeEndedRecords, ResumeChanges, verifyAccessToken } from './app/index.ts';
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
const mcpUrl = process.env['MCP_URL'] ?? `http://localhost:${port}/mcp`;
const allowedGitHubIds = process.env['ALLOWED_GITHUB_IDS']
  ?.split(',')
  .map((id) => id.trim())
  .filter((id) => id !== '');
const allowlist = allowedGitHubIds && allowedGitHubIds.length > 0 ? new Set(allowedGitHubIds) : null;
if (!allowlist && mcpAuthKind(mcpUrl) === 'oauth') {
  throw new Error(
    'ALLOWED_GITHUB_IDS is not set: a hosted app (https MCP_URL) lets in only the GitHub ids it lists',
  );
}

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
  allowlist,
  now: () => new Date(),
};

const { app, close } = createHttpApp(
  {
    repositoryFor: (ownerId) => new PostgresResumeRepository(db, ownerId),
    resumeChanges,
    signIn,
    templates: templateCatalog,
    appOrigin,
  },
  {
    fontsDir,
    iconsDir,
    isHealthy: () => isDatabaseReachable(db),
    // Chrome runs next to this server and opens the CV from it, over IPv4 like the server listens.
    ...(chromePath && {
      pdf: {
        renderPdf: createChromeRenderer({ chromePath, appUrl: `http://127.0.0.1:${port}` }),
        inspectPdf,
      },
    }),
  },
);

// Hosted (https), MCP is authorised by this app's own OAuth server and the browser signs in through the app's
// origin. Run locally (http on localhost), the Claude apps would refuse the http sign-in page, so MCP serves only
// this machine and acts for OWNER_GITHUB_ID (ADR-0028).
const oauth = {
  clients: new PostgresOAuthClientRepository(db),
  grants: new PostgresOAuthGrantRepository(db),
  resource: mcpUrl,
  issuer: appOrigin,
  now: () => new Date(),
};
let mcpAuth: McpAuth;
if (mcpAuthKind(mcpUrl) === 'oauth') {
  mcpAuth = {
    kind: 'oauth',
    verifyAccessToken: (token) => verifyAccessToken(oauth, token),
    resource: mcpUrl,
  };
} else {
  mcpAuth = {
    kind: 'local',
    owner: async () => {
      const owner = await findOwner(db);
      return owner.kind === 'found' ? { kind: 'found', userId: owner.user.id } : owner;
    },
  };
}
// Ended sessions, codes and tokens are deleted at start and every hour, once kept long enough (ADR-0028).
const purge = async () => {
  try {
    const deleted = await purgeEndedRecords({
      sessions: signIn.sessions,
      grants: oauth.grants,
      now: () => new Date(),
    });
    if (deleted.sessions + deleted.grants > 0) {
      console.log(`Deleted ended records: ${deleted.sessions} sessions, ${deleted.grants} OAuth rows`);
    }
  } catch (error) {
    console.error('Deleting ended sessions and OAuth grants failed:', error);
  }
};
void purge();
// unref: the timer alone does not keep the process running.
const purgeTimer = setInterval(() => void purge(), 60 * 60 * 1000).unref();

console.log(`MCP on ${mcpUrl}: ${mcpAuth.kind === 'oauth' ? 'OAuth' : 'local, for OWNER_GITHUB_ID'}`);

const mcp = createMcpHttpApp({
  dependenciesFor: (userId) => ({
    repository: new PostgresResumeRepository(db, userId),
    templates: templateCatalog,
    parseHtml,
    resumeChanges: resumeChanges.forOwner(userId),
  }),
  auth: mcpAuth,
});

const root = new Hono();
if (mcpAuth.kind === 'oauth') {
  root.route(
    '/',
    createOAuthApp({
      oauth,
      signIn,
      appOrigin,
      // The direct peer. Behind a reverse proxy that is the proxy for everyone (issue #33).
      clientAddress: (c) => getConnInfo(c).remote.address ?? 'unknown',
    }),
  );
}
root.route('/', app);
root.route('/mcp', mcp.app);

// --- Server ---

const server = serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Markup Résumé API on http://localhost:${info.port}`);
});

const shutdown = () => {
  clearInterval(purgeTimer);
  close();
  void mcp.close();
  void db.destroy();
  server.close();
  // server.close() only stops new connections. Open keep-alive ones would still take requests, and the UI's
  // event stream reconnects at once, so the process would never exit.
  if ('closeAllConnections' in server) {
    server.closeAllConnections();
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
