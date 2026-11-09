import { TestBed } from '@angular/core/testing';
import { InDevelopment } from './in-development';

describe('InDevelopment', () => {
  it("shows the section's title, what it will do, and that it is in development", async () => {
    const fixture = TestBed.createComponent(InDevelopment);
    fixture.componentRef.setInput('section', 'masterFile');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Master file');
    expect(root.querySelector('.text')?.textContent).toContain('Claude picks from it for each CV');
    expect(root.querySelector('.status')?.textContent?.trim()).toBe('In development');
    expect(root.querySelector('.art')?.getAttribute('src')).toBe(
      'illustrations/in-development/master-file.svg',
    );
    expect(root.querySelector('.screen')?.getAttribute('src')).toBe(
      'illustrations/in-development/master-file-screen.svg',
    );
  });
});
