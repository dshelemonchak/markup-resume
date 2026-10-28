/** Validation state of a CV's last export, shown as a coloured dot. */
export type CvListItemStatus = 'valid' | 'warning' | 'not-exported';

/**
 * One CV in the sidebar. UI-local shape for now; it will be replaced by the
 * API types shared from the app package's domain (ADR-0016).
 */
export interface CvListItem {
  /** Stable file id, never changes (ADR-0017). */
  readonly id: string;
  /** Display title, renamable. */
  readonly title: string;
  /** Secondary line, e.g. "senior-angular · edited by Claude". */
  readonly subtitle: string;
  readonly status: CvListItemStatus;
  readonly pinned: boolean;
}

/**
 * Where the list stands: still loading, the server cannot be reached, the server failed to answer, or loaded
 * (and maybe empty).
 */
export type CvListState = 'loading' | 'unreachable' | 'failed' | 'ready';
