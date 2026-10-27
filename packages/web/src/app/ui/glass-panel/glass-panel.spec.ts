import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GlassPanel, type GlassPanelVariant } from './glass-panel';

@Component({
  imports: [GlassPanel],
  template: `
    <aside cvc-glass-panel id="bare">sidebar</aside>
    <div cvc-glass-panel [variant]="variant()" id="bound">control</div>
    <span cvc-glass-panel id="inline">not a block</span>
  `,
})
class Host {
  readonly variant = signal<GlassPanelVariant>('compact');
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, bare: root.querySelector('#bare')!, bound: root.querySelector('#bound')! };
}

describe('GlassPanel', () => {
  it('keeps the host element and its content', async () => {
    const { bare } = await render();
    expect(bare.tagName).toBe('ASIDE');
    expect(bare.textContent).toBe('sidebar');
  });

  it('defaults to the panel variant', async () => {
    const { bare } = await render();
    expect(bare.classList.contains('compact')).toBe(false);
  });

  it('applies and removes the compact variant', async () => {
    const { fixture, bound } = await render();
    expect(bound.classList.contains('compact')).toBe(true);

    fixture.componentInstance.variant.set('panel');
    await fixture.whenStable();
    expect(bound.classList.contains('compact')).toBe(false);
  });

  it('only attaches to the supported block elements', async () => {
    const { fixture } = await render();
    const hosts = fixture.debugElement
      .queryAll(By.directive(GlassPanel))
      .map((d) => (d.nativeElement as HTMLElement).id);
    expect(hosts).toEqual(['bare', 'bound']);
  });
});
