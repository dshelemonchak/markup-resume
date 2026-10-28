import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RibbonGroup } from './ribbon-group';

@Component({
  imports: [RibbonGroup],
  template: `<mr-ribbon-group label="View"><button type="button">Visual</button></mr-ribbon-group>`,
})
class Host {}

describe('RibbonGroup', () => {
  it('projects the control and shows the caption', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const group = (fixture.nativeElement as HTMLElement).querySelector('mr-ribbon-group')!;
    expect(group.querySelector('.control button')?.textContent).toBe('Visual');
    expect(group.querySelector('.caption')?.textContent?.trim()).toBe('View');
  });

  it('is a named group for assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const group = (fixture.nativeElement as HTMLElement).querySelector('mr-ribbon-group')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('View');
  });
});
