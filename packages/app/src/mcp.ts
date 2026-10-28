// Composition root for the MCP server (ADR-0003): Claude Desktop / Claude Code start this process and talk
// JSON-RPC over its stdin/stdout.
//   CV_DATA_DIR  data directory (default ./data); CVs live in <dir>/cvs/<id>/document.html
//   CV_APP_URL   the cv-kit app, told when Claude connects and acts (ADR-0018); unset: not told
// stdout belongs to the protocol: start it with `node src/mcp.ts`, not through pnpm (which prints a banner
// to stdout), and log only to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createMcpServer } from './adapters/mcp/mcp-server.ts';
import { type PresenceReporter, reportPresence } from './adapters/presence-http/presence-reporter.ts';
import { FsCvRepository } from './adapters/storage-fs/fs-cv-repository.ts';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const appUrl = process.env['CV_APP_URL'];

const repository = new FsCvRepository(dataDir);
await repository.init();

let presence: PresenceReporter | undefined;
const server = createMcpServer(repository, { onToolCall: () => presence?.activity() });

// The client introduces itself in the handshake; only then is there something to report.
server.server.oninitialized = () => {
  const client = server.server.getClientVersion();
  if (!appUrl || !client) return;
  presence = reportPresence({
    appUrl,
    sessionId: randomUUID(),
    client: client.name,
    version: client.version,
  });
};

// The presence connection would keep the process alive: stop it when Claude goes away.
const stop = () => presence?.stop();
process.stdin.once('close', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);

await server.connect(new StdioServerTransport());
console.error(`cv-kit MCP server on stdio · data: ${dataDir}`);
