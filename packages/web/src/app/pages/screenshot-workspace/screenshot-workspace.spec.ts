import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ResumeApi } from '../../api/resume-api';
import { ScreenshotWorkspace } from './screenshot-workspace';

describe('ScreenshotWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.unstubAllGlobals();
  });

  it('shows one pinned and three unpinned fictional CVs without requesting personal data', async () => {
    const fixture = TestBed.createComponent(ScreenshotWorkspace);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const groups = root.querySelectorAll('.group');

    expect(groups[0]!.querySelectorAll('mr-sidebar-item')).toHaveLength(1);
    expect(groups[1]!.querySelectorAll('mr-sidebar-item')).toHaveLength(3);
    expect(root.querySelector('.group .title')?.textContent).toBe('Senior Angular Engineer');
    expect(root.querySelector('iframe')?.getAttribute('src')).toBe('/screenshot/angular-engineer.html');
    expect(EventSource).not.toHaveBeenCalled();
  });

  it('switches documents and changes pins in memory only', async () => {
    const fixture = TestBed.createComponent(ScreenshotWorkspace);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLButtonElement>('.item-main')[1]!.click();
    await fixture.whenStable();
    expect(root.querySelector('iframe')?.getAttribute('src')).toBe('/screenshot/frontend-platform.html');

    const api = fixture.debugElement.injector.get(ResumeApi);
    await api.togglePin('angular-engineer');
    await fixture.whenStable();
    expect(root.querySelectorAll('.group')).toHaveLength(1);
    expect(root.querySelectorAll('mr-sidebar-item')).toHaveLength(4);
    expect((await api.exportPdf('angular-engineer')).kind).toBe('failed');
    expect(EventSource).not.toHaveBeenCalled();
  });
});
