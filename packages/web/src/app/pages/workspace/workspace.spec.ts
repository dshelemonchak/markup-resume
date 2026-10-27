import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Workspace } from './workspace';

class FakeEventSource {
  static last: FakeEventSource | undefined;
  private readonly listeners = new Map<string, () => void>();
  constructor() {
    FakeEventSource.last = this;
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
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const frameSrc = () => root.querySelector('cvc-document-canvas iframe')?.getAttribute('src');
    return { fixture, http, root, frameSrc };
  }

  it('lists CVs from the server and previews the first one', async () => {
    const { root, frameSrc } = await render();
    expect([...root.querySelectorAll('cvc-sidebar-item .title')].map((el) => el.textContent)).toEqual([
      'First',
      'Second',
    ]);
    expect(frameSrc()).toBe('/api/v1/cvs/first/document?v=0');
  });

  it('keeps the selection and reloads list and preview when the server reports a change', async () => {
    const { fixture, http, root, frameSrc } = await render();
    root.querySelectorAll<HTMLButtonElement>('cvc-sidebar-item button')[1]!.click();
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/cvs/second/document?v=0');

    FakeEventSource.last!.emit('cvs-changed');
    TestBed.tick();
    http.expectOne('/api/v1/cvs').flush(CVS);
    await fixture.whenStable();
    expect(frameSrc()).toBe('/api/v1/cvs/second/document?v=1');
  });
});
