import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ResumeListItemDto } from '../../api/resume-api';
import { sessionExpiryInterceptor } from '../../api/session-expiry';
import { ConnectClaude } from '../../layout/connect-claude/connect-claude';
import { Landing } from '../landing/landing';
import { Workspace } from './workspace';

class FakeEventSource {
  static readonly CLOSED = 2;
  static last: FakeEventSource | undefined;
  static created = 0;
  readyState = 1;
  private readonly listeners = new Map<string, () => void>();
  constructor() {
    FakeEventSource.last = this;
    FakeEventSource.created++;
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  emit(type: string): void {
    this.listeners.get(type)?.();
  }
  close(): void {}
}

const CVS: readonly ResumeListItemDto[] = [
  { slug: 'first', title: 'First', updatedAt: '2026-10-27T10:00:00.000Z', pinned: false },
  { slug: 'second', title: 'Second', updatedAt: '2026-10-26T10:00:00.000Z', pinned: false },
];

describe('Workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(resumes = CVS) {
    const fixture = TestBed.createComponent(Workspace);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick(); // ask who is signed in (the app stays unstable until it is answered)
    http.expectOne('/api/v1/user').flush({ name: 'Alex' });
    await Promise.resolve(); // the resource takes the answer in a microtask
    TestBed.tick(); // then the list
    http.expectOne('/api/v1/resumes').flush(resumes);
    http.expectOne('/api/v1/claude/sessions').flush([]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const frameSrc = () => root.querySelector('mr-document-canvas iframe')?.getAttribute('src');
    return { fixture, http, root, frameSrc };
  }

  it('lists CVs from the server and previews the first one', async () => {
    const { root, frameSrc } = await render();
    expect([...root.querySelectorAll('mr-sidebar-item .title')].map((el) => el.textContent)).toEqual([
      'First',
      'Second',
    ]);
    expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=0');
  });

  it('keeps the selection and reloads list and preview when the server reports a change', async () => {
    const { fixture, http, root, frameSrc } = await render();
    root.querySelectorAll<HTMLButtonElement>('mr-sidebar-item .item-main')[1]!.click();
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/resumes/second/document?v=0');

    FakeEventSource.last!.emit('resume-changed');
    TestBed.tick();
    http.expectOne('/api/v1/resumes').flush(CVS);
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/resumes/second/document?v=1');
  });

  it.each([false, true])(
    'toggles an unselected CV with pinned=%s and regroups it after SSE',
    async (pinned) => {
      const resumes = CVS.map((resume) => (resume.slug === 'second' ? { ...resume, pinned } : resume));
      const { fixture, http, root, frameSrc } = await render(resumes);
      const row = [...root.querySelectorAll<HTMLElement>('mr-sidebar-item')].find(
        (item) => item.querySelector('.title')?.textContent === 'Second',
      )!;
      row.querySelector<HTMLButtonElement>('.item-menu-btn')!.click();
      await fixture.whenStable();
      document.body.querySelector<HTMLButtonElement>('.dropdown-menu.show button')!.click();

      const request = http.expectOne('/api/v1/resumes/second/pin');
      expect(request.request.method).toBe('POST');
      request.flush({ pinned: !pinned });
      await fixture.whenStable();
      expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=0');

      FakeEventSource.last!.emit('resume-changed');
      TestBed.tick();
      http
        .expectOne('/api/v1/resumes')
        .flush(resumes.map((resume) => (resume.slug === 'second' ? { ...resume, pinned: !pinned } : resume)));
      await fixture.whenStable();

      const group = pinned ? 'sidebar-all' : 'sidebar-pinned';
      expect(root.querySelector(`[aria-labelledby="${group}"]`)!.textContent).toContain('Second');
      expect(root.querySelector('[aria-current="true"] .title')?.textContent).toBe('First');
      expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=1');
      http.verify();
    },
  );

  it('logs a failed pin request without changing the selection', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { fixture, http, root, frameSrc } = await render();
      root.querySelectorAll<HTMLButtonElement>('.item-menu-btn')[1]!.click();
      await fixture.whenStable();
      document.body.querySelector<HTMLButtonElement>('.dropdown-menu.show button')!.click();
      http.expectOne('/api/v1/resumes/second/pin').flush(
        { error: 'failed' },
        {
          status: 500,
          statusText: 'Internal Server Error',
        },
      );
      await fixture.whenStable();

      expect(log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 500 }));
      expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=0');
      http.verify();
    } finally {
      log.mockRestore();
    }
  });

  it('shows Claude as connected when the server reports a session', async () => {
    const { fixture, http, root } = await render();
    expect(root.querySelector('.connection')!.textContent).toContain('Connect Claude');

    FakeEventSource.last!.emit('claude-changed');
    TestBed.tick();
    http.expectOne('/api/v1/claude/sessions').flush([
      {
        id: 's1',
        client: 'claude-ai',
        version: '1.0',
        connectedAt: '2026-10-28T10:00:00.000Z',
        lastActivityAt: null,
      },
    ]);
    await fixture.whenStable();
    expect(root.querySelector('.connection')!.getAttribute('aria-label')).toBe('Claude Desktop connected');
  });

  it('offers to connect Claude while there are no CVs yet', async () => {
    const open = vi.spyOn(ConnectClaude.prototype, 'open').mockImplementation(() => undefined);
    const { root } = await render([]);
    const empty = root.querySelector('.document-area .first-cv')!;
    expect(empty.querySelector('h2')!.textContent).toContain('Connect Claude to write your first CV');
    expect(empty.querySelector('.prompt')!.textContent).toContain('Create a CV for me');

    empty.querySelector<HTMLButtonElement>('button')!.click();
    expect(open).toHaveBeenCalledOnce();
    open.mockRestore();
  });

  it('shows the way to sign in, and asks for nothing else, while nobody is signed in', async () => {
    const streams = FakeEventSource.created;
    const fixture = TestBed.createComponent(Workspace);
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    TestBed.tick();
    http
      .expectOne('/api/v1/user')
      .flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(root.querySelector('.document-area a[href="/auth/github"]')!.textContent).toContain(
      'Sign in with GitHub',
    );
    expect(root.querySelector('mr-sidebar .empty')!.textContent).toContain('Sign in to see your CVs');
    expect(root.querySelector('mr-sidebar .account')).toBeNull();
    http.verify(); // no list, no Claude sessions
    expect(FakeEventSource.created).toBe(streams);
  });

  it('signs out on request and then shows the way to sign in', async () => {
    const { fixture, http, root } = await render();
    expect(root.querySelector('mr-sidebar .account .name')!.textContent).toBe('Alex');

    root.querySelector<HTMLButtonElement>('mr-sidebar .sign-out')!.click();
    http
      .expectOne({ method: 'POST', url: '/auth/logout' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await Promise.resolve();
    TestBed.tick();
    http
      .expectOne('/api/v1/user')
      .flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    expect(root.querySelector('.document-area a[href="/auth/github"]')).not.toBeNull();
    expect(root.querySelectorAll('mr-sidebar-item')).toHaveLength(0);
  });

  const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
  const signInLink = (root: HTMLElement) => root.querySelector('.document-area a[href="/auth/github"]');

  it('shows the way to sign in when the session ends, as soon as a request answers 401', async () => {
    const { fixture, http, root } = await render();
    FakeEventSource.last!.emit('resume-changed');
    TestBed.tick();
    http.expectOne('/api/v1/resumes').flush({ error: 'unauthenticated' }, UNAUTHORIZED);
    await Promise.resolve();
    TestBed.tick();
    http.expectOne('/api/v1/user').flush({ error: 'unauthenticated' }, UNAUTHORIZED);
    await fixture.whenStable();
    expect(signInLink(root)).not.toBeNull();
    expect(root.querySelectorAll('mr-sidebar-item')).toHaveLength(0);
  });

  it('finds out from a request why the event stream closed, and signs out on a 401', async () => {
    const { fixture, http, root } = await render();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const streams = FakeEventSource.created;
      FakeEventSource.last!.readyState = FakeEventSource.CLOSED;
      FakeEventSource.last!.emit('error');
      http.expectOne('/api/v1/user').flush({ error: 'unauthenticated' }, UNAUTHORIZED); // the probe
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
      http.expectOne('/api/v1/user').flush({ error: 'unauthenticated' }, UNAUTHORIZED); // the current user again
      await vi.advanceTimersByTimeAsync(10_000);
      TestBed.tick();
      expect(signInLink(root)).not.toBeNull();
      expect(FakeEventSource.created).toBe(streams); // the pending reconnect was cancelled
    } finally {
      vi.useRealTimers();
    }
    await fixture.whenStable();
  });

  it('reloads the list and the preview when the stream comes back after the server restarted', async () => {
    const { fixture, http, frameSrc } = await render();
    FakeEventSource.last!.emit('ready'); // the first connection: nothing failed, nothing to reload
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      FakeEventSource.last!.readyState = FakeEventSource.CLOSED;
      FakeEventSource.last!.emit('error');
      http.expectOne('/api/v1/user').flush({ name: 'Alex' }); // still signed in: the server was only away
      await vi.advanceTimersByTimeAsync(2_000);
    } finally {
      vi.useRealTimers();
    }
    FakeEventSource.last!.emit('ready');
    TestBed.tick();
    http.expectOne('/api/v1/resumes').flush(CVS);
    http.expectOne('/api/v1/claude/sessions').flush([]);
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=1');
  });

  it('returns to the landing page after signing out', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: Landing },
          { path: 'cvs', component: Workspace },
        ]),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    // Navigation and resources answer in macrotasks; the open requests keep the app from being stable.
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
    };
    const harness = await RouterTestingHarness.create();
    const opened = harness.navigateByUrl('/cvs');
    await settle();
    http.expectOne('/api/v1/user').flush({ name: 'Alex' });
    await settle();
    http.expectOne('/api/v1/resumes').flush(CVS);
    http.expectOne('/api/v1/claude/sessions').flush([]);
    await opened;

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('mr-sidebar .sign-out')!.click();
    http
      .expectOne({ method: 'POST', url: '/auth/logout' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    http
      .expectOne('/api/v1/user')
      .flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/');
    expect(harness.routeNativeElement!.querySelector('mr-landing, .btn-github')).not.toBeNull();
  });

  it('says so when signing out does not reach the server, and stays on the CVs', async () => {
    const { fixture, http, root } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    root.querySelector<HTMLButtonElement>('mr-sidebar .sign-out')!.click();
    http
      .expectOne({ method: 'POST', url: '/auth/logout' })
      .flush('', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(root.querySelector('mr-sidebar .sign-out-failed')!.textContent).toContain('still signed in');
    expect(root.querySelector('mr-sidebar .account .name')!.textContent).toBe('Alex');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('tells loading from an unreachable server, and recovers when the server is back', async () => {
    const fixture = TestBed.createComponent(Workspace);
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const message = () => root.querySelector('.document-area .empty')?.textContent ?? '';
    TestBed.tick(); // the requests are pending, so the app is not stable yet
    expect(message()).toContain('Loading CVs');

    http.expectOne('/api/v1/user').flush({ name: 'Alex' });
    await Promise.resolve();
    TestBed.tick();
    http.expectOne('/api/v1/resumes').error(new ProgressEvent('error'));
    http.expectOne('/api/v1/claude/sessions').error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(message()).toContain('not reachable');
    expect(root.querySelector('mr-sidebar .empty')!.textContent).toContain('Server not reachable');

    // The dev proxy answers the event stream with 502 while the server is down: EventSource gives up, so
    // the app opens a new one after a pause, and its "ready" means the server is back.
    vi.useFakeTimers();
    const before = FakeEventSource.created;
    FakeEventSource.last!.readyState = FakeEventSource.CLOSED;
    FakeEventSource.last!.emit('error');
    vi.advanceTimersByTime(2_000);
    vi.useRealTimers();
    expect(FakeEventSource.created).toBe(before + 1);
    FakeEventSource.last!.emit('ready');
    TestBed.tick();
    http.expectOne('/api/v1/resumes').flush(CVS);
    http.expectOne('/api/v1/claude/sessions').flush([]);
    await fixture.whenStable();
    expect(root.querySelectorAll('mr-sidebar-item')).toHaveLength(2);
  });

  it('reports a failing server apart from an unreachable one, and tries again by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fixture = TestBed.createComponent(Workspace);
      const http = TestBed.inject(HttpTestingController);
      const root = fixture.nativeElement as HTMLElement;
      const settle = async () => {
        await vi.advanceTimersByTimeAsync(0);
        TestBed.tick();
      };
      TestBed.tick();
      http.expectOne('/api/v1/user').flush({ name: 'Alex' });
      await settle();
      http.expectOne('/api/v1/resumes').flush('boom', { status: 500, statusText: 'Server Error' });
      http.expectOne('/api/v1/claude/sessions').flush([]);
      await settle();
      expect(root.querySelector('mr-sidebar .empty')!.textContent).toContain('Could not load the CVs');
      expect(root.querySelector('.document-area .empty')!.textContent).toContain('could not load');

      await vi.advanceTimersByTimeAsync(5_000);
      TestBed.tick();
      http.expectOne('/api/v1/resumes').flush(CVS);
      await settle();
      expect(root.querySelectorAll('mr-sidebar-item')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a dropped event stream to the browser while it is still retrying', async () => {
    await render();
    const before = FakeEventSource.created;
    vi.useFakeTimers();
    FakeEventSource.last!.emit('error'); // readyState stays CONNECTING: EventSource retries itself
    vi.advanceTimersByTime(10_000);
    vi.useRealTimers();
    expect(FakeEventSource.created).toBe(before);
  });

  it('previews and exports the ATS version of the same CV when ATS is chosen', async () => {
    const { fixture, http, root, frameSrc } = await render();
    root.querySelector<HTMLInputElement>('#preview-mode-ats')!.click();
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/resumes/first/document?v=0&mode=ats');

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: () => {} });
    root.querySelector<HTMLButtonElement>('mr-document-header .export')!.click();
    http.expectOne('/api/v1/resumes/first/pdf?mode=ats').flush(new Blob(['%PDF-']), {
      headers: { 'Content-Disposition': 'attachment; filename="First.pdf"' },
    });
    await fixture.whenStable();
  });

  it('shows what the PDF check found, and downloads the PDF anyway on request', async () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.open = true;
      },
      close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // jsdom has no object URLs.
    Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: () => {} });
    const { fixture, http, root } = await render();

    root.querySelector<HTMLButtonElement>('mr-document-header .export')!.click();
    http
      .expectOne('/api/v1/resumes/first/pdf')
      .flush(
        new Blob([
          JSON.stringify({ error: 'pdf-check-failed', problems: [{ code: 'font-type3', font: 'Shapes' }] }),
        ]),
        {
          status: 422,
          statusText: 'Unprocessable',
        },
      );
    await fixture.whenStable();
    expect(root.querySelector('mr-export-report dialog')!.hasAttribute('open')).toBe(true);
    expect(root.querySelector('mr-export-report .problems')!.textContent).toContain(
      'The font Shapes is drawn as shapes (Type 3)',
    );

    [...root.querySelectorAll<HTMLButtonElement>('mr-export-report button')]
      .find((button) => button.textContent.includes('Download anyway'))!
      .click();
    http.expectOne('/api/v1/resumes/first/pdf?force=1').flush(new Blob(['%PDF-']), {
      headers: {
        'Content-Disposition': `attachment; filename="First.pdf"; filename*=UTF-8''First%20%E2%80%93%20CV.pdf`,
      },
    });
    await fixture.whenStable();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('First – CV.pdf');
    vi.restoreAllMocks();
  });
});
