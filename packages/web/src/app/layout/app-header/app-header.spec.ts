import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppHeader } from './app-header';

@Component({ template: '' })
class Blank {}

describe('AppHeader', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'cvs', component: Blank },
          { path: 'account', component: Blank },
        ]),
      ],
    });
  });

  async function render(userName: string | null = null) {
    const fixture = TestBed.createComponent(AppHeader);
    fixture.componentRef.setInput('userName', userName);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('links to every main page', async () => {
    const { root } = await render();
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.nav a')];
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Applications', '/applications'],
      ['CVs', '/cvs'],
      ['Master file', '/master-file'],
      ['Templates', '/templates'],
    ]);
  });

  it('marks the current page', async () => {
    const { fixture, root } = await render();
    await TestBed.inject(Router).navigateByUrl('/cvs');
    await fixture.whenStable();
    const current = root.querySelectorAll('[aria-current="page"]');
    expect([...current].map((link) => link.textContent?.trim())).toEqual(['CVs']);
  });

  it("shows the user's initials on the account link, or an icon while the name is unknown", async () => {
    const { fixture, root } = await render('Alex van Smith');
    const account = root.querySelector('a.account')!;
    expect(account.getAttribute('href')).toBe('/account');
    expect(account.getAttribute('aria-label')).toBe('Account');
    expect(account.textContent?.trim()).toBe('AV');
    fixture.componentRef.setInput('userName', null);
    await fixture.whenStable();
    expect(account.querySelector('.bi-person-circle')).not.toBeNull();
  });
});
