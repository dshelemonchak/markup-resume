/** Validation state of a CV's last export, shown as a coloured dot. */
export type ResumeListItemStatus = 'valid' | 'warning' | 'not-exported';

/**
 * One CV in the sidebar. UI-local shape for now; it will be replaced by the
 * API types shared from the app package's domain (ADR-0016).
 */
export interface ResumeListItem {
  /** The resume's slug: what the URLs use, never changes. */
  readonly slug: string;
  /** Display title, renamable. */
  readonly title: string;
  /** Secondary line, e.g. "senior-angular · edited by Claude". */
  readonly subtitle: string;
  readonly status: ResumeListItemStatus;
  readonly pinned: boolean;
}

/**
 * Where the list stands: still loading, the server cannot be reached, the server failed to answer, or loaded
 * (and maybe empty).
 */
export type ResumeListState = 'loading' | 'unreachable' | 'failed' | 'ready';
