import type { CanonicalCvHtml } from '../document/validate-cv-document.ts';
import type { CvId, CvSummary } from './cv.ts';

/** Port: where CV documents are stored (ADR-0012). The file-system adapter implements it in v1. */
export interface CvRepository {
  list(): Promise<readonly CvSummary[]>;
  /** The document's HTML, or null when no CV has this id. Stored documents are trusted as they are (ADR-0024). */
  getDocument(id: CvId): Promise<string | null>;
  /**
   * Replaces the document of an existing CV. The write is atomic: readers see either the old or the new
   * document, never a partial one. Rejects when no CV has this id; creating CVs is a separate operation. Takes only
   * checked HTML (validateCvDocument), so nothing unchecked reaches storage.
   */
  save(id: CvId, html: CanonicalCvHtml): Promise<void>;
  /**
   * Stores the document of a new CV, atomically like save. Resolves false, writing nothing, when a CV with
   * this id already exists; the check and the write are one step, so two creates cannot both succeed.
   */
  create(id: CvId, html: CanonicalCvHtml): Promise<boolean>;
}
