import type { CvId, CvSummary } from './cv.ts';

/** Port: where CV documents are stored (ADR-0012). The file-system adapter implements it in v1. */
export interface CvRepository {
  list(): Promise<readonly CvSummary[]>;
  /** The document's HTML, or null when no CV has this id. */
  getDocument(id: CvId): Promise<string | null>;
  /** Calls the listener whenever any CV is added, changed or removed. Returns an unsubscribe function. */
  watch(listener: () => void): () => void;
}
