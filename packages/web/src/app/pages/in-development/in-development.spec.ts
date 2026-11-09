import { TestBed } from '@angular/core/testing';
import { InDevelopment } from './in-development';

describe('InDevelopment', () => {
  it('shows the page title and that the page is in development', async () => {
    const fixture = TestBed.createComponent(InDevelopment);
    fixture.componentRef.setInput('titleKey', 'nav.templates');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Templates');
    expect(root.querySelector('.status')?.textContent?.trim()).toBe('In development');
  });
});
