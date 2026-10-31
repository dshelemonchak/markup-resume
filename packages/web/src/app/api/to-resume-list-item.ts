import type { ResumeListItem } from '../layout/resume-list-item';
import type { ResumeListItemDto } from './resume-api';

const formats = new Map<string, Intl.DateTimeFormat>();

/** "27 Oct, 21:56" in the given locale; one formatter per locale. */
function updatedAt(date: Date, locale: string): string {
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    formats.set(locale, format);
  }
  return format.format(date);
}

/**
 * API summary → sidebar item. Status and pinning are not stored on the server yet,
 * so every CV is "not exported" and unpinned for now.
 */
export function toResumeListItem(resume: ResumeListItemDto, locale: string): ResumeListItem {
  return {
    slug: resume.slug,
    title: resume.title,
    subtitle: `${resume.slug} · ${updatedAt(new Date(resume.updatedAt), locale)}`,
    status: 'not-exported',
    pinned: false,
  };
}
