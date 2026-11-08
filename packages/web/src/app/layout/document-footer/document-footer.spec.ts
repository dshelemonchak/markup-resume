import { TestBed } from '@angular/core/testing';
import { RELEASE_VERSION } from '../../version';
import { DocumentFooter } from './document-footer';

describe('DocumentFooter', () => {
  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(DocumentFooter);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows pages, page size by mode, and the font', async () => {
    const { fixture, root } = await render({ info: { pages: 2, font: 'Inter', scale: 0.8 } });
    expect(root.querySelector('.pages')!.textContent).toBe('2 pages · 210 mm');
    expect(root.querySelector('.font')!.textContent).toBe('Inter');

    fixture.componentRef.setInput('mode', 'ats');
    await fixture.whenStable();
    expect(root.querySelector('.pages')!.textContent).toBe('2 pages · A4');
  });

  it('leaves out what is not measured yet', async () => {
    const { root } = await render({ info: null });
    expect(root.querySelector('.pages')).toBeNull();
    expect(root.querySelector('.font')).toBeNull();
  });

  it('passes the zoom through its controls', async () => {
    const { fixture, root } = await render({ info: { pages: 1, font: null, scale: 0.8 } });
    expect(root.querySelector('mr-zoom-control .level')!.textContent?.trim()).toBe('80%');
    root.querySelector<HTMLButtonElement>('mr-zoom-control [aria-label="Zoom in"]')!.click();
    expect(fixture.componentInstance.zoom()).toBe(1);
  });

  it('shows the app version at the right end', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: RELEASE_VERSION, useValue: 'v1.2.3' }] });
    const { root } = await render({ info: null });
    const version = root.querySelector('.version')!;
    expect(version.textContent).toBe('v1.2.3');
    expect(version.getAttribute('title')).toBe('App version');
    expect(version.nextElementSibling).toBeNull();
  });
});
