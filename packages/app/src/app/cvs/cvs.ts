import {
  type CanonicalCvHtml,
  type CvStore,
  type CvSummary,
  type CvTemplateRef,
  isValidCvId,
  parseCvAddress,
  type ParseMarkup,
  readCvTitle,
  type RevisionAuthor,
  type TemplateCatalog,
  validateCvDocument,
} from '../../domain/index.ts';
import type { CvChanges } from '../cv-changes/cv-changes.ts';

/** What storing a CV document needs: where it goes, the templates it may use, and an HTML parser. */
export interface CvDocumentServices {
  readonly store: CvStore;
  readonly templates: TemplateCatalog;
  readonly parseMarkup: ParseMarkup;
  readonly cvChanges: CvChanges;
}

/** All CVs, most recently changed first. The id is the CV's slug. */
export async function listCvs(store: CvStore): Promise<readonly CvSummary[]> {
  const cvs = await store.list();
  return cvs.map((cv) => ({ id: cv.slug, title: cv.title, updatedAt: cv.updatedAt, revision: cv.revision }));
}

export type CvDocumentResult =
  | {
      readonly kind: 'found';
      readonly slug: string;
      readonly html: string;
      readonly number: number;
      /** Number of the current revision. */
      readonly current: number;
    }
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'not-found' };

/**
 * One revision of a CV, by address: "senior-angular" for the current one, "senior-angular@7" for another. The
 * address comes from outside (URL, MCP call), so it is validated here.
 */
export async function getCvDocument(store: CvStore, address: string): Promise<CvDocumentResult> {
  const parsed = parseCvAddress(address);
  if (!parsed) {
    return { kind: 'invalid-id' };
  }
  const revision = await store.read(parsed.slug, parsed.number);
  if (revision === null) {
    return { kind: 'not-found' };
  }
  return {
    kind: 'found',
    slug: revision.slug,
    html: revision.html,
    number: revision.number,
    current: revision.current,
  };
}

/** Upper bound for one document, in UTF-8 bytes. Real CVs are tens of kilobytes; this stops runaway output. */
export const MAX_CV_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type SaveCvDocumentResult =
  | {
      readonly kind: 'saved';
      readonly slug: string;
      readonly number: number;
      readonly basedOn: number;
      /** False when the base was an older revision: newer ones are not in this one. */
      readonly basedOnCurrent: boolean;
    }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unknown-revision' }
  | Rejection;

/**
 * Writes the next revision of an existing CV. "senior-angular" builds on the current revision, and a document
 * identical to it (both canonical) writes nothing. "senior-angular@7" builds on revision 7, which the user asked
 * for, and always writes a new revision. Checks that need no I/O run first; the CV's title follows the document's
 * cv:title.
 */
export async function saveCvDocument(
  services: CvDocumentServices,
  address: string,
  html: string,
  author: RevisionAuthor,
): Promise<SaveCvDocumentResult> {
  const parsed = parseCvAddress(address);
  if (!parsed) {
    return { kind: 'invalid-id' };
  }
  const { slug, number } = parsed;
  const incoming = prepareIncoming(services, slug, html);
  if (incoming.kind !== 'ready') {
    return incoming;
  }

  if (number === undefined) {
    const current = await services.store.read(slug);
    if (current === null) {
      return { kind: 'not-found' };
    }
    if (current.html === incoming.html) {
      return { kind: 'unchanged' };
    }
  }
  const written = await services.store.write({
    slug,
    ...(number !== undefined && { basedOn: number }),
    title: incoming.title,
    html: incoming.html,
    template: incoming.template,
    author,
    kind: 'write',
  });
  if (written.kind === 'not-found') {
    return { kind: 'not-found' };
  }
  if (written.kind === 'unknown-base') {
    return { kind: 'unknown-revision' };
  }
  services.cvChanges.notify(slug);
  return {
    kind: 'saved',
    slug,
    number: written.number,
    basedOn: written.basedOn,
    basedOnCurrent: written.basedOnCurrent,
  };
}

export type CreateCvDocumentResult =
  { readonly kind: 'created' } | { readonly kind: 'already-exists' } | Rejection;

/** Stores a new CV under a new id, with the same checks as saveCvDocument. Never replaces an existing CV. */
export async function createCvDocument(
  services: CvDocumentServices,
  id: string,
  html: string,
  author: RevisionAuthor,
): Promise<CreateCvDocumentResult> {
  const incoming = prepareIncoming(services, id, html);
  if (incoming.kind !== 'ready') {
    return incoming;
  }

  const created = await services.store.create({
    slug: id,
    title: incoming.title,
    html: incoming.html,
    template: incoming.template,
    author,
  });
  if (created === 'slug-taken') {
    return { kind: 'already-exists' };
  }
  services.cvChanges.notify(id);
  return { kind: 'created' };
}

type Rejection =
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'too-large'; readonly bytes: number; readonly limitBytes: number }
  | { readonly kind: 'invalid-document'; readonly problems: readonly string[] };

/**
 * The checks of an incoming document that need no I/O: the id, the size of what was sent, then the validation
 * boundary (ADR-0024). Gives the document as it will be stored, canonical and with the template styles in, the
 * template it names and its title; or why it may not be stored.
 */
function prepareIncoming(
  { templates, parseMarkup }: CvDocumentServices,
  id: string,
  html: string,
):
  | {
      readonly kind: 'ready';
      readonly html: CanonicalCvHtml;
      readonly template: CvTemplateRef;
      readonly title: string;
    }
  | Rejection {
  if (!isValidCvId(id)) {
    return { kind: 'invalid-id' };
  }
  const bytes = new TextEncoder().encode(html).byteLength;
  if (bytes > MAX_CV_DOCUMENT_BYTES) {
    return { kind: 'too-large', bytes, limitBytes: MAX_CV_DOCUMENT_BYTES };
  }
  const document = validateCvDocument(html, templates, parseMarkup);
  if (document.kind === 'invalid') {
    return { kind: 'invalid-document', problems: document.problems };
  }
  // The boundary requires cv:title, so the fallback to the id never shows in practice.
  const title = readCvTitle(document.html) ?? id;
  return { kind: 'ready', html: document.html, template: document.template, title };
}
