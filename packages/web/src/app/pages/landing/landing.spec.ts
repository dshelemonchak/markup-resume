import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener(): void {}
        close(): void {}
      },
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  async function render(user: { name: string } | null) {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Landing);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    const request = http.expectOne('/api/v1/user');
    if (user) {
      request.flush(user);
    } else {
      request.flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    }
    await Promise.resolve();
    TestBed.tick();
    return { navigate, root: fixture.nativeElement as HTMLElement };
  }

  it('offers sign-in with GitHub to a visitor, and Google as coming soon', async () => {
    const { navigate, root } = await render(null);
    expect(root.querySelector('.btn-github')?.getAttribute('href')).toBe('/auth/github');
    expect(root.querySelector<HTMLButtonElement>('.btn-google')?.disabled).toBe(true);
    expect(root.querySelector('#google-soon')?.textContent?.trim()).toBe('Coming soon');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says why signing in did not work', async () => {
    window.history.replaceState(null, '', '/?signIn=not-allowed');
    const { root } = await render(null);
    expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'This GitHub account has no access to this server.',
    );
  });

  it('sends a signed-in user on to the CVs', async () => {
    const { navigate } = await render({ name: 'Alex' });
    expect(navigate).toHaveBeenCalledWith('/cvs', { replaceUrl: true });
  });
});
