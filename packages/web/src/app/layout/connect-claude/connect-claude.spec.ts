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

  async function render() {
    const fixture = TestBed.createComponent(ConnectClaude);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, dialog: root.querySelector('dialog')! };
  }

  it('opens as a modal and closes', async () => {
    const { fixture, dialog } = await render();
    expect(dialog.open).toBe(false);
    fixture.componentInstance.open();
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(dialog.open).toBe(false);
  });

  it('gives Claude Desktop the hosted address and Claude Code the command, each to copy', async () => {
    const { root } = await render();
    const copyText = (section: string) =>
      root.querySelector(`[aria-labelledby="${section}"] mr-copy-block code`)!.textContent;
    expect(copyText('connect-claude-desktop')).toBe('https://markup-resume.xyz/mcp');
    expect(copyText('connect-claude-code')).toBe(
      'claude mcp add --transport http markup-resume https://markup-resume.xyz/mcp',
    );
    expect(root.querySelector('.sign-in')!.innerHTML).toContain('<code>/mcp</code>');
    expect(root.querySelector('a[download]')).toBeNull();
  });

  it('lists the Claude clients connected now', async () => {
    const { fixture, root } = await render();
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
