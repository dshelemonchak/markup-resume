/** Stable CV id: the folder name in the data directory. Never changes (ADR-0017). */
export type CvId = string;

/** What the list of CVs needs to know about one document. */
export interface CvSummary {
  readonly id: CvId;
  /** From <meta name="cv:title">, falling back to the id. */
  readonly title: string;
  /** Last modification of the document, ISO 8601. */
  readonly updatedAt: string;
  /** Number of the current revision. */
  readonly revision: number;
}

const CV_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Ids are lower-case words joined by single hyphens. Anything else is rejected,
 * which also rules out path tricks such as "../" or absolute paths.
 */
export function isValidCvId(value: string): value is CvId {
  return value.length <= 100 && CV_ID.test(value);
}
