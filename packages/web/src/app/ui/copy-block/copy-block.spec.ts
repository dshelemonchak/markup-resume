import { TestBed } from '@angular/core/testing';
import { CopyBlock } from './copy-block';

describe('CopyBlock', () => {
  // jsdom has no clipboard; each test puts in its own.
  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }

  afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'));

  async function render() {
    const fixture = TestBed.createComponent(CopyBlock);
    fixture.componentRef.setInput('text', 'some text');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const click = async () => {
      root.querySelector<HTMLButtonElement>('.copy')!.click();
      await fixture.whenStable();
    };
    return { root, click };
  }

  it('copies the text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const { root, click } = await render();
    expect(root.querySelector('pre')!.textContent).toBe('some text');

    await click();
    expect(writeText).toHaveBeenCalledWith('some text');
    expect(root.querySelector('.copy')!.textContent).toContain('Copied');
  });

  it('selects the text for a manual copy when the clipboard is refused', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const { root, click } = await render();

    await click();
    expect(getSelection()!.toString()).toBe('some text');
    expect(root.querySelector('.copy')!.textContent).toContain('Press ⌘C');
  });
});
