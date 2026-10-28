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

  it('leads with the prompt and folds the manual steps', async () => {
    const { root } = await render('/Users/me/CV');
    const [prompt, config] = [...root.querySelectorAll('pre')].map((pre) => pre.textContent);
    expect(prompt).toContain('Add the cv-kit MCP server');
    expect(prompt).toContain('/Users/me/CV');
    expect(root.querySelector('details.manual')!.contains(root.querySelectorAll('pre')[1]!)).toBe(true);
    expect(config).toContain('"mcpServers"');
  });

  it('asks to replace the project folder only when it is unknown', async () => {
    const known = await render('/Users/me/CV');
    expect(known.root.querySelector('.steps')!.textContent).not.toContain('/path/to/CV');

    const unknown = await render(null);
    expect(unknown.root.querySelector('.steps')!.textContent).toContain('/path/to/CV');
  });
});
