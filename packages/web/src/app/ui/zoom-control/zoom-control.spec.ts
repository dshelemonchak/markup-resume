import { TestBed } from '@angular/core/testing';
import { ZoomControl } from './zoom-control';

describe('ZoomControl', () => {
  async function render(scale: number) {
    const fixture = TestBed.createComponent(ZoomControl);
    fixture.componentRef.setInput('scale', scale);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!;
    return { fixture, root, button };
  }

  it('shows the scale as a percentage and marks Fit as active', async () => {
    const { root, button } = await render(0.8);
    expect(root.querySelector('.level')!.textContent?.trim()).toBe('80%');
    expect(button('.fit').getAttribute('aria-pressed')).toBe('true');
  });

  it('steps from the current scale and returns to fit', async () => {
    const { fixture, button } = await render(0.8);
    const zoom = () => fixture.componentInstance.zoom();

    button('[aria-label="Zoom in"]').click();
    expect(zoom()).toBe(1);
    button('[aria-label="Zoom out"]').click();
    expect(zoom()).toBe(0.75);
    button('.level').click();
    expect(zoom()).toBe(1);
    button('.fit').click();
    expect(zoom()).toBe('fit');
  });

  it('disables the buttons at the limits', async () => {
    const { button } = await render(0.25);
    expect(button('[aria-label="Zoom out"]').disabled).toBe(true);
    expect(button('[aria-label="Zoom in"]').disabled).toBe(false);
  });
});
