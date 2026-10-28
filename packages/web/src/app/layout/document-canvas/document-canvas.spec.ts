import { TestBed } from '@angular/core/testing';
import { DocumentCanvas } from './document-canvas';
import type { DocumentInfo } from './document-info';

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

  it('applies the zoom setting as the scale and reports it', async () => {
    const { fixture, root } = await render();
    const reported: DocumentInfo[] = [];
    fixture.componentInstance.documentInfo.subscribe((info) => reported.push(info));

    fixture.componentRef.setInput('zoom', 1.5);
    await fixture.whenStable();
    expect(root.querySelector<HTMLElement>('.sheet')!.style.width).toBe(`${794 * 1.5}px`);
    expect(reported.at(-1)).toEqual({ pages: 1, font: null, scale: 1.5 });
  });
});
