/** Stand-ins the user replaces: the app runs in a container and cannot see the host's paths. */
export const DOCKER_PLACEHOLDER = '/path/to/docker';
export const PROJECT_PLACEHOLDER = '/path/to/CV';

/**
 * The "mcpServers" block for claude_desktop_config.json, to add inside the file's top-level
 * object rather than to replace the file: it also holds the app's own preferences.
 * Absolute paths, because Claude Desktop starts the server without the shell's PATH or folder.
 */
export function desktopConfig(projectDir: string | null): string {
  const servers = {
    'markup-resume': {
      command: DOCKER_PLACEHOLDER,
      args: ['compose', '--project-directory', projectDir ?? PROJECT_PLACEHOLDER, 'run', '--rm', '-T', 'mcp'],
    },
  };
  return `"mcpServers": ${JSON.stringify(servers, null, 2)}`;
}

/**
 * A prompt for Claude Code, which can edit files on this machine, to do the manual setup:
 * the Claude Desktop chat cannot change its own config. Claude Desktop must be closed meanwhile,
 * since while it runs it rewrites the file from memory and drops the new entry; so the prompt is
 * for Claude Code in a terminal, which survives Claude Desktop quitting.
 */
export function desktopPrompt(projectDir: string | null): string {
  const projectFolder = projectDir
    ? ''
    : ` and the Markup Résumé project folder in place of ${PROJECT_PLACEHOLDER} (ask me if unsure)`;
  return [
    'Add the Markup Résumé MCP server to my Claude Desktop config.',
    '1. Find the docker binary with `which docker`.',
    '2. Quit Claude Desktop (osascript -e \'quit app "Claude"\') and wait until it has exited: while it runs, it rewrites its config and drops new entries.',
    '3. Back up ~/Library/Application Support/Claude/claude_desktop_config.json.',
    `4. Merge this block into the file's top-level object, keeping every other key as is, with the docker path in place of ${DOCKER_PLACEHOLDER}${projectFolder}:`,
    desktopConfig(projectDir),
    '5. Check that the server starts: run its command, send an MCP initialize and tools/list, and expect list_cvs, read_cv, write_cv, create_cv and read_template.',
    '6. Open Claude Desktop again (open -a Claude).',
  ].join('\n');
}
