import type { CanonicalResumeHtml, TemplateRef } from '../document/validate-resume-document.ts';

/**
 * Port: one owner's CVs and their revisions, in the database (ADR-0025). Revisions are only ever added; each one
 * records the revision it was made from. The repository acts for one owner, so no method takes an owner.
 */
export interface ResumeRepository {
  /** The owner's CVs not in the trash, most recently changed first. */
  list(): Promise<readonly ResumeListItem[]>;
  /** A revision of a CV not in the trash: the given number, or the current one; null when there is no such. */
  read(slug: string, number?: number): Promise<ResumeRevision | null>;
  /** A new CV with its first revision, in one transaction. A slug stays taken while its CV is in the trash. */
  create(resume: CreateResumeInput): Promise<'created' | 'slug-taken'>;
  /**
   * The next revision of a CV, which becomes the current one. It is based on the given revision, or on the current
   * one. The repository picks the number; the CV's title follows the document's resume:title (the last action wins).
   */
  write(revision: WriteRevisionInput): Promise<WriteRevisionResult>;
}

export type RevisionAuthor = 'user' | 'claude' | 'system';
/** write: a changed document; restore: an exact copy of the revision it is based on. */
export type RevisionKind = 'write' | 'restore';

/** What the list of resumes needs to know about one. */
export interface ResumeListItem {
  readonly slug: string;
  readonly title: string;
  /** Number of the current revision. */
  readonly revision: number;
  /** ISO 8601. */
  readonly updatedAt: string;
}

export interface ResumeRevision {
  readonly slug: string;
  readonly number: number;
  /** Number of the CV's current revision, to tell whether this one is it. */
  readonly current: number;
  /** Number of the revision this one was made from; null for the first. */
  readonly basedOn: number | null;
  readonly html: string;
  readonly template: TemplateRef;
  readonly author: RevisionAuthor;
  readonly kind: RevisionKind;
  /** ISO 8601. */
  readonly createdAt: string;
}

export interface CreateResumeInput {
  readonly slug: string;
  readonly title: string;
  readonly html: CanonicalResumeHtml;
  readonly template: TemplateRef;
  readonly author: RevisionAuthor;
}

export interface WriteRevisionInput {
  readonly slug: string;
  /** The revision to build on; the current one when left out. */
  readonly basedOn?: number;
  readonly title: string;
  readonly html: CanonicalResumeHtml;
  readonly template: TemplateRef;
  readonly author: RevisionAuthor;
  readonly kind: RevisionKind;
}

export type WriteRevisionResult =
  | {
      readonly kind: 'written';
      readonly number: number;
      readonly basedOn: number;
      /** False when the base was an older revision: newer ones are not in this one. */
      readonly basedOnCurrent: boolean;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unknown-base' };
