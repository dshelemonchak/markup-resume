import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Shell } from './shell';

@Component({
  imports: [Shell],
  template: `<mr-shell><p class="projected">content</p></mr-shell>`,
})
class Host {}

describe('Shell', () => {
  it('projects its content', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('mr-shell .content .projected')?.textContent).toBe('content');
  });

  it('hides the decorative glows from assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const glows = (fixture.nativeElement as HTMLElement).querySelectorAll('mr-shell .glow');
    expect(glows).toHaveLength(2);
    glows.forEach((glow) => expect(glow.getAttribute('aria-hidden')).toBe('true'));
  });
});
