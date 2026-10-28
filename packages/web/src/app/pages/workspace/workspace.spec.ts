import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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

const CVS = [
  { id: 'first', title: 'First', updatedAt: '2026-10-27T10:00:00.000Z' },
  { id: 'second', title: 'Second', updatedAt: '2026-10-26T10:00:00.000Z' },
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
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(Workspace);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick(); // issue the list request (the app stays unstable until it is answered)
    http.expectOne('/api/v1/cvs').flush(CVS);
    http.expectOne('/api/v1/setup').flush({ hostProjectDir: '/Users/me/CV' });
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
    expect(frameSrc()).toBe('/api/v1/cvs/first/document?v=0');
  });

  it('puts the host project folder into the Connect Claude dialog', async () => {
    const { root } = await render();
    expect(root.querySelector('mr-connect-claude pre')!.textContent).toContain('/Users/me/CV');
  });

  it('keeps the selection and reloads list and preview when the server reports a change', async () => {
    const { fixture, http, root, frameSrc } = await render();
    root.querySelectorAll<HTMLButtonElement>('mr-sidebar-item button')[1]!.click();
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/cvs/second/document?v=0');

    FakeEventSource.last!.emit('cvs-changed');
    TestBed.tick();
    http.expectOne('/api/v1/cvs').flush(CVS);
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/cvs/second/document?v=1');
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

  it('tells loading from an unreachable server, and recovers when the server is back', async () => {
    const fixture = TestBed.createComponent(Workspace);
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const message = () => root.querySelector('.document-area .empty')?.textContent ?? '';
    TestBed.tick(); // the requests are pending, so the app is not stable yet
    expect(message()).toContain('Loading CVs');

    http.expectOne('/api/v1/cvs').error(new ProgressEvent('error'));
    http.expectOne('/api/v1/setup').error(new ProgressEvent('error'));
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
    http.expectOne('/api/v1/cvs').flush(CVS);
    http.expectOne('/api/v1/setup').flush({ hostProjectDir: null });
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
      http.expectOne('/api/v1/cvs').flush('boom', { status: 500, statusText: 'Server Error' });
      http.expectOne('/api/v1/setup').flush({ hostProjectDir: null });
      http.expectOne('/api/v1/claude/sessions').flush([]);
      await settle();
      expect(root.querySelector('mr-sidebar .empty')!.textContent).toContain('Could not load the CVs');
      expect(root.querySelector('.document-area .empty')!.textContent).toContain('could not load');

      await vi.advanceTimersByTimeAsync(5_000);
      TestBed.tick();
      http.expectOne('/api/v1/cvs').flush(CVS);
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
      .expectOne('/api/v1/cvs/first/pdf')
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
    http.expectOne('/api/v1/cvs/first/pdf?force=1').flush(new Blob(['%PDF-']), {
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
