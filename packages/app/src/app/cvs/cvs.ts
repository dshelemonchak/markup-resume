import {
  type CanonicalCvHtml,
  type CvStore,
  type CvSummary,
  type CvTemplateRef,
  isValidCvId,
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
  return cvs.map((cv) => ({ id: cv.slug, title: cv.title, updatedAt: cv.updatedAt }));
}

export type CvDocumentResult =
  | { readonly kind: 'found'; readonly html: string }
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'not-found' };

/** The current document of one CV. The id comes from outside (URL, MCP call), so it is validated here. */
export async function getCvDocument(store: CvStore, id: string): Promise<CvDocumentResult> {
  if (!isValidCvId(id)) {
    return { kind: 'invalid-id' };
  }
  const revision = await store.read(id);
  return revision === null ? { kind: 'not-found' } : { kind: 'found', html: revision.html };
}

/** Upper bound for one document, in UTF-8 bytes. Real CVs are tens of kilobytes; this stops runaway output. */
export const MAX_CV_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type SaveCvDocumentResult =
  { readonly kind: 'saved' } | { readonly kind: 'unchanged' } | { readonly kind: 'not-found' } | Rejection;

/**
 * Writes the next revision of an existing CV, on top of the current one. Checks that need no I/O run first; a
 * document identical to the current one (both canonical) is not written, so it adds no revision. The CV's title
 * follows the document's cv:title.
 */
export async function saveCvDocument(
  services: CvDocumentServices,
  id: string,
  html: string,
  author: RevisionAuthor,
): Promise<SaveCvDocumentResult> {
  const incoming = prepareIncoming(services, id, html);
  if (incoming.kind !== 'ready') {
    return incoming;
  }

  const current = await services.store.read(id);
  if (current === null) {
    return { kind: 'not-found' };
  }
  if (current.html === incoming.html) {
    return { kind: 'unchanged' };
  }
  const written = await services.store.write({
    slug: id,
    title: incoming.title,
    html: incoming.html,
    template: incoming.template,
    author,
    kind: 'write',
  });
  if (written.kind !== 'written') {
    return { kind: 'not-found' };
  }
  services.cvChanges.notify(id);
  return { kind: 'saved' };
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
