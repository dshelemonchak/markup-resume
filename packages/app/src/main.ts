// Composition root: wires adapters together and starts the HTTP server.
//   CV_DATA_DIR  data directory (default ./data); CVs live in <dir>/cvs/<id>/document.html
//   PORT         HTTP port (default 3000)
//   HOST_PROJECT_DIR  project folder on the host, shown in the UI's Claude setup (optional)
import { fontsDir, iconsDir } from '@cv-kit/styles';
import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createHttpApp } from './adapters/http/http-app.ts';
import { FsCvRepository } from './adapters/storage-fs/fs-cv-repository.ts';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const port = Number(process.env['PORT'] ?? 3000);

const repository = new FsCvRepository(dataDir);
await repository.init();

const { app, close } = createHttpApp(repository, {
  hostProjectDir: process.env['HOST_PROJECT_DIR'] || null,
  fontsDir,
  iconsDir,
});
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`cv-kit API on http://localhost:${info.port} · data: ${dataDir}`);
});

const shutdown = () => {
  close();
  server.close();
  // server.close() only stops new connections. Open keep-alive ones would still take requests, and the MCP servers'
  // presence connections and the UI's event stream reconnect at once, so the process would never exit.
  if ('closeAllConnections' in server) server.closeAllConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
