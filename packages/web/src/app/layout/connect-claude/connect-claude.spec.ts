import { TestBed } from '@angular/core/testing';
import { ConnectClaude } from './connect-claude';

describe('ConnectClaude', () => {
  // jsdom has no modal dialogs.
  beforeAll(() => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.open = true;
      },
      close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
  });

  async function render(projectDir: string | null) {
    const fixture = TestBed.createComponent(ConnectClaude);
    fixture.componentRef.setInput('projectDir', projectDir);
    fixture.componentRef.setInput('extensionUrl', '/api/v1/claude/desktop-extension');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, dialog: root.querySelector('dialog')! };
  }

  it('opens as a modal and closes', async () => {
    const { fixture, dialog } = await render('/Users/me/CV');
    expect(dialog.open).toBe(false);
    fixture.componentInstance.open();
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(dialog.open).toBe(false);
  });

  it('leads with the extension download and folds the other ways', async () => {
    const { root } = await render('/Users/me/CV');
    const download = root.querySelector<HTMLAnchorElement>('a.download')!;
    expect(download.getAttribute('href')).toBe('/api/v1/claude/desktop-extension');
    expect(download.getAttribute('download')).toBe('markup-resume.mcpb');

    const [prompt, config] = [...root.querySelectorAll('details.manual pre')].map((pre) => pre.textContent);
    expect(prompt).toContain('Add the Markup Résumé MCP server');
    expect(prompt).toContain('/Users/me/CV');
    expect(config).toContain('"mcpServers"');
  });

  it('asks to replace the project folder only when it is unknown', async () => {
    const known = await render('/Users/me/CV');
    expect(known.root.querySelector('details .steps')!.textContent).not.toContain('/path/to/markup-resume');

    const unknown = await render(null);
    expect(unknown.root.querySelector('details .steps')!.textContent).toContain('/path/to/markup-resume');
  });

  it('lists the Claude clients connected now', async () => {
    const { fixture, root } = await render('/Users/me/CV');
    expect(root.querySelector('.sessions')).toBeNull();

    fixture.componentRef.setInput('sessions', [
      { id: 'a', name: 'Claude Desktop', lastUsed: '2 min ago' },
      { id: 'b', name: 'Claude Code', lastUsed: null },
    ]);
    await fixture.whenStable();
    expect(
      [...root.querySelectorAll('.sessions li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Claude Desktop · last used 2 min ago', 'Claude Code · no tool calls yet']);
  });
});
