import { DOCKER_PLACEHOLDER, PROJECT_PLACEHOLDER, desktopConfig, desktopPrompt } from './desktop-config';

const parse = (block: string) => JSON.parse(`{${block}}`) as { mcpServers: Record<string, unknown> };

describe('desktopConfig', () => {
  it('runs the MCP service of the project through Docker', () => {
    expect(parse(desktopConfig('/Users/me/CV')).mcpServers['cv-kit']).toEqual({
      command: DOCKER_PLACEHOLDER,
      args: ['compose', '--project-directory', '/Users/me/CV', 'run', '--rm', '-T', 'mcp'],
    });
  });

  it('leaves a placeholder for an unknown project folder', () => {
    expect(desktopConfig(null)).toContain(PROJECT_PLACEHOLDER);
  });
});

describe('desktopPrompt', () => {
  it('carries the config block and the project folder', () => {
    const prompt = desktopPrompt('/Users/me/CV');
    expect(prompt).toContain(desktopConfig('/Users/me/CV'));
    expect(prompt).not.toContain(PROJECT_PLACEHOLDER);
  });

  it('asks for the project folder when it is unknown', () => {
    expect(desktopPrompt(null)).toContain(`the cv-kit project folder in place of ${PROJECT_PLACEHOLDER}`);
  });
});
