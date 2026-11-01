import { Injectable, resource, signal } from '@angular/core';
import type { ClaudeSessionDto, PdfExport, ResumeApi, ResumeListItemDto } from '../api/resume-api';
import { injectTranslate } from '../i18n/i18n';

const RESUMES: readonly ResumeListItemDto[] = [
  {
    slug: 'angular-engineer',
    title: 'Senior Angular Engineer',
    updatedAt: '2026-11-01T09:40:00Z',
    pinned: true,
  },
  {
    slug: 'frontend-platform',
    title: 'Frontend Platform Engineer',
    updatedAt: '2026-11-01T09:15:00Z',
    pinned: false,
  },
  {
    slug: 'fullstack-engineer',
    title: 'Full-stack Engineer',
    updatedAt: '2026-10-31T16:30:00Z',
    pinned: false,
  },
  {
    slug: 'design-systems',
    title: 'Design Systems Engineer',
    updatedAt: '2026-10-30T11:20:00Z',
    pinned: false,
  },
];

/** No real CV requests, event stream or persistence. Pins reset on page reload. */
@Injectable()
export class ScreenshotResumeApi implements Pick<ResumeApi, 'documentUrl' | 'togglePin' | 'exportPdf'> {
  readonly resumes = resource({ defaultValue: RESUMES, loader: () => Promise.resolve(RESUMES) });
  readonly claudeSessions = resource<readonly ClaudeSessionDto[], unknown>({
    defaultValue: [],
    loader: () => Promise.resolve([]),
  });
  readonly revision = signal(0);
  private readonly translate = injectTranslate();

  documentUrl(slug: string): string {
    return RESUMES.some((resume) => resume.slug === slug) ? `/screenshot/${slug}.html` : 'about:blank';
  }

  togglePin(slug: string): Promise<{ pinned: boolean }> {
    const pinned = !this.resumes.value().find((resume) => resume.slug === slug)?.pinned;
    this.resumes.update((resumes) =>
      resumes.map((resume) => (resume.slug === slug ? { ...resume, pinned } : resume)),
    );
    return Promise.resolve({ pinned });
  }

  exportPdf(): Promise<PdfExport> {
    /** t(screenshot.exportUnavailable) */
    return Promise.resolve({ kind: 'failed', message: this.translate('screenshot.exportUnavailable') });
  }
}
