// Composition root for the MCP server (ADR-0003): Claude Desktop / Claude Code start this process and talk
// JSON-RPC over its stdin/stdout.
//   CV_DATA_DIR  data directory (default ./data); CVs live in <dir>/cvs/<id>/document.html
// stdout belongs to the protocol: start it with `node src/mcp.ts`, not through pnpm (which prints a banner
// to stdout), and log only to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { resolve } from 'node:path';
import { createMcpServer } from './adapters/mcp/mcp-server.ts';
import { FsCvRepository } from './adapters/storage-fs/fs-cv-repository.ts';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');

const repository = new FsCvRepository(dataDir);
await repository.init();

const server = createMcpServer(repository);
await server.connect(new StdioServerTransport());
console.error(`cv-kit MCP server on stdio · data: ${dataDir}`);
