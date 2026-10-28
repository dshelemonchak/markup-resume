import { zip } from './zip.ts';

const SCRIPT = 'server/markup-resume.sh';

// Claude Desktop starts the server without the shell's PATH; Docker Desktop puts docker in one of these.
const LAUNCHER = `#!/bin/sh
# Starts Markup Résumé's MCP server through Docker, for Claude Desktop. $1: the Markup Résumé project folder.
PATH="$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
exec docker compose --project-directory "$1" run --rm -T mcp
`;

/**
 * A Claude Desktop extension (.mcpb: a ZIP with manifest.json at its root) that runs Markup Résumé's MCP
 * server. Installed from Claude Desktop's own UI, so no hand-edited config that the running app
 * could overwrite. Claude Desktop asks for the project folder on install; a known one is the default.
 */
export function desktopExtension(projectDir: string | null): Uint8Array<ArrayBuffer> {
  const manifest = {
    manifest_version: '0.3',
    name: 'markup-resume',
    display_name: 'markup-resume',
    version: '0.0.0',
    description: 'List, read, write and create your CVs in Markup Résumé.',
    long_description:
      'Runs the Markup Résumé MCP server from your Markup Résumé project through Docker. Keep Docker Desktop running.',
    author: { name: 'markup-resume' },
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
        title: 'Markup Résumé project folder',
        description: 'The folder with compose.yaml, where you cloned Markup Résumé.',
        required: true,
        ...(projectDir ? { default: projectDir } : {}),
      },
    },
    tools: [
      { name: 'list_cvs', description: 'Lists the CVs stored in Markup Résumé.' },
      { name: 'read_cv', description: 'Returns the full HTML document of one CV.' },
      { name: 'write_cv', description: 'Replaces the whole HTML document of an existing CV.' },
      { name: 'create_cv', description: 'Creates a new CV from a complete HTML document.' },
      { name: 'read_template', description: "Returns a CV template's design system and an example." },
    ],
    compatibility: { platforms: ['darwin'] },
  };

  return zip([
    { path: 'manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: SCRIPT, content: LAUNCHER, mode: 0o755 },
  ]);
}
