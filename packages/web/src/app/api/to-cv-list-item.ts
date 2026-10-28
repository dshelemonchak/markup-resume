import type { CvListItem } from '../layout/cv-list-item';
import type { CvSummaryDto } from './cv-api';

const UPDATED_AT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * API summary → sidebar item. Status and pinning are not stored on the server yet,
 * so every CV is "not exported" and unpinned for now.
 */
export function toCvListItem(cv: CvSummaryDto): CvListItem {
  return {
    id: cv.id,
    title: cv.title,
    subtitle: `${cv.id} · ${UPDATED_AT.format(new Date(cv.updatedAt))}`,
    status: 'not-exported',
    pinned: false,
  };
}
