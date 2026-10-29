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

  it('explains Claude Code, and that Claude Desktop waits for the hosted version', async () => {
    const { root } = await render();
    expect(root.querySelector('#connect-claude-code + p')!.innerHTML).toContain('<code>.mcp.json</code>');
    expect(root.querySelector('#connect-claude-desktop + p')!.textContent).toContain('hosted version');
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
