import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Shell } from './shell';

describe('Shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('puts the global header above the routed page', async () => {
    const fixture = TestBed.createComponent(Shell);
    TestBed.tick(); // the header asks who is signed in; the app stays unstable until it is answered
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/user')
      .flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.firstElementChild?.tagName).toBe('MR-APP-HEADER');
    expect(root.querySelector('.content router-outlet')).not.toBeNull();
  });
});
