import { TestBed } from '@angular/core/testing';
import { DocumentCanvas } from './document-canvas';
import type { DocumentInfo } from '../document-info';

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
    fixture.componentRef.setInput('src', '/api/v1/resumes/sample/document');
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('renders the CV in a sandboxed iframe without scripts', async () => {
    const { root } = await render();
    const frame = root.querySelector('iframe')!;
    expect(frame.getAttribute('title')).toBe('CV preview');
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame.getAttribute('src')).toBe('/api/v1/resumes/sample/document');
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

  it('makes the frame as tall as the document, rounding a fractional height up so it never scrolls inside', async () => {
    const { fixture, root } = await render();
    const frame = root.querySelector('iframe')!;
    // jsdom loads no frame content: give the frame a document.
    const document = window.document.implementation.createHTMLDocument('CV');
    Object.defineProperty(frame, 'contentDocument', { value: document });
    const page = document.documentElement;
    // A layout height of 1124.59 px, which scrollHeight reports as 1124.
    Object.defineProperty(page, 'scrollHeight', { value: 1124, configurable: true });
    page.getBoundingClientRect = () => ({ height: 1124.59 }) as DOMRect;
    frame.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(frame.style.height).toBe('1125px');
  });
});
