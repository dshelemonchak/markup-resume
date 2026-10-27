import { TestBed } from '@angular/core/testing';
import { DocumentCanvas } from './document-canvas';

describe('DocumentCanvas', () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver; the canvas then keeps its "not measured yet" 100% fit.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(DocumentCanvas);
    fixture.componentRef.setInput('src', 'examples/sample-cv.html');
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('renders the CV in a sandboxed iframe without scripts', async () => {
    const { root } = await render();
    const frame = root.querySelector('iframe')!;
    expect(frame.getAttribute('title')).toBe('CV preview');
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame.getAttribute('src')).toBe('examples/sample-cv.html');
  });

  it('zooms in steps and returns to fit', async () => {
    const { fixture, root } = await render();
    const level = () => root.querySelector('.level')!.textContent?.trim();
    const fit = root.querySelector<HTMLButtonElement>('.fit')!;
    expect(level()).toBe('100%');
    expect(fit.getAttribute('aria-pressed')).toBe('true');

    root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();
    await fixture.whenStable();
    expect(level()).toBe('125%');
    expect(fit.getAttribute('aria-pressed')).toBe('false');

    fit.click();
    await fixture.whenStable();
    expect(level()).toBe('100%');
  });
});
