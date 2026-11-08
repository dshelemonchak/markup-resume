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

  describe('overflow shadow', () => {
    /** Loads a frame document of the given height. */
    async function load(fixture: Awaited<ReturnType<typeof render>>['fixture'], height: number) {
      const frame = (fixture.nativeElement as HTMLElement).querySelector('iframe')!;
      const document = window.document.implementation.createHTMLDocument('CV');
      Object.defineProperty(frame, 'contentDocument', { value: document, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: height, configurable: true });
      document.documentElement.getBoundingClientRect = () => ({ height }) as DOMRect;
      frame.dispatchEvent(new Event('load'));
      await fixture.whenStable();
    }
    const shadow = (root: HTMLElement) => root.querySelector('.overflow');

    it('shows when the CV is taller than one page', async () => {
      const { fixture, root } = await render();
      await load(fixture, 1300);
      expect(shadow(root)).not.toBeNull();
      expect(shadow(root)!.textContent).toContain('The CV is longer than one page');
    });

    it('stays away when the CV fits the page, to the sub-pixel rounding of the measure', async () => {
      const { fixture, root } = await render();
      await load(fixture, 1123);
      expect(shadow(root)).toBeNull();
      await load(fixture, 1124.59);
      expect(shadow(root)).toBeNull();
    });

    it('stays away in the ATS version, which is one column and may run longer', async () => {
      const { fixture, root } = await render();
      fixture.componentRef.setInput('mode', 'ats');
      await load(fixture, 1300);
      expect(shadow(root)).toBeNull();
    });
  });
});
