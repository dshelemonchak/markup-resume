import { zip } from './zip.ts';

const SCRIPT = 'server/cv-kit.sh';

// Claude Desktop starts the server without the shell's PATH; Docker Desktop puts docker in one of these.
const LAUNCHER = `#!/bin/sh
# Starts cv-kit's MCP server through Docker, for Claude Desktop. $1: the cv-kit project folder.
PATH="$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
exec docker compose --project-directory "$1" run --rm -T mcp
`;

/**
 * A Claude Desktop extension (.mcpb: a ZIP with manifest.json at its root) that runs cv-kit's MCP
 * server. Installed from Claude Desktop's own UI, so no hand-edited config that the running app
 * could overwrite. Claude Desktop asks for the project folder on install; a known one is the default.
 */
export function desktopExtension(projectDir: string | null): Uint8Array<ArrayBuffer> {
  const manifest = {
    manifest_version: '0.3',
    name: 'cv-kit',
    display_name: 'cv-kit',
    version: '0.0.0',
    description: 'List, read, write and create the CVs in your local cv-kit.',
    long_description:
      'Runs the cv-kit MCP server from your cv-kit project through Docker. Keep Docker Desktop running.',
    author: { name: 'cv-kit' },
    server: {
      type: 'binary',
      entry_point: SCRIPT,
      mcp_config: {
        command: '/bin/sh',
        args: [`\${__dirname}/${SCRIPT}`, '${user_config.project_dir}'],
      },
    },
    user_config: {
      project_dir: {
        type: 'directory',
        title: 'cv-kit project folder',
        description: 'The folder with compose.yaml, where you cloned cv-kit.',
        required: true,
        ...(projectDir ? { default: projectDir } : {}),
      },
    },
    tools: [
      { name: 'list_cvs', description: 'Lists the CVs stored in cv-kit.' },
      { name: 'read_cv', description: 'Returns the full HTML document of one CV.' },
      { name: 'write_cv', description: 'Replaces the whole HTML document of an existing CV.' },
      { name: 'create_cv', description: 'Creates a new CV from a complete HTML document.' },
    ],
    compatibility: { platforms: ['darwin'] },
  };

  return zip([
    { path: 'manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: SCRIPT, content: LAUNCHER, mode: 0o755 },
  ]);
}
