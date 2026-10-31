import {
  type CanonicalResumeHtml,
  type ResumeRepository,
  type ResumeListItem,
  type TemplateRef,
  isValidResumeSlug,
  parseResumeAddress,
  type HtmlParser,
  readResumeTitle,
  type RevisionAuthor,
  type TemplateCatalog,
  validateResumeDocument,
} from '../../domain/index.ts';
import type { ResumeChanges } from '../resume-changes/resume-changes.ts';

/** What storing a CV document needs: where it goes, the templates it may use, and an HTML parser. */
export interface ResumeDocumentDependencies {
  readonly repository: ResumeRepository;
  readonly templates: TemplateCatalog;
  readonly parseHtml: HtmlParser;
  readonly resumeChanges: ResumeChanges;
}

/** All resumes, most recently changed first. */
export async function listResumes(repository: ResumeRepository): Promise<readonly ResumeListItem[]> {
  return repository.list();
}

export type ReadResumeDocumentResult =
  | {
      readonly kind: 'found';
      readonly slug: string;
      readonly html: string;
      readonly number: number;
      /** Number of the current revision. */
      readonly current: number;
    }
  | { readonly kind: 'invalid-slug' }
  | { readonly kind: 'not-found' };

/**
 * One revision of a CV, by address: "senior-angular" for the current one, "senior-angular@7" for another. The
 * address comes from outside (URL, MCP call), so it is validated here.
 */
export async function readResumeDocument(
  repository: ResumeRepository,
  address: string,
): Promise<ReadResumeDocumentResult> {
  const parsed = parseResumeAddress(address);
  if (!parsed) {
    return { kind: 'invalid-slug' };
  }
  const revision = await repository.read(parsed.slug, parsed.number);
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
export const MAX_RESUME_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type SaveResumeDocumentResult =
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
 * resume:title.
 */
export async function saveResumeDocument(
  dependencies: ResumeDocumentDependencies,
  address: string,
  html: string,
  author: RevisionAuthor,
): Promise<SaveResumeDocumentResult> {
  const parsed = parseResumeAddress(address);
  if (!parsed) {
    return { kind: 'invalid-slug' };
  }
  const { slug, number } = parsed;
  const incoming = prepareIncoming(dependencies, slug, html);
  if (incoming.kind !== 'ready') {
    return incoming;
  }

  if (number === undefined) {
    const current = await dependencies.repository.read(slug);
    if (current === null) {
      return { kind: 'not-found' };
    }
    if (current.html === incoming.html) {
      return { kind: 'unchanged' };
    }
  }
  const written = await dependencies.repository.write({
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
  dependencies.resumeChanges.notify(slug);
  return {
    kind: 'saved',
    slug,
    number: written.number,
    basedOn: written.basedOn,
    basedOnCurrent: written.basedOnCurrent,
  };
}

export type CreateResumeDocumentResult =
  { readonly kind: 'created' } | { readonly kind: 'already-exists' } | Rejection;

/** Stores a new CV under a new slug, with the same checks as saveResumeDocument. Never replaces an existing CV. */
export async function createResumeDocument(
  dependencies: ResumeDocumentDependencies,
  slug: string,
  html: string,
  author: RevisionAuthor,
): Promise<CreateResumeDocumentResult> {
  const incoming = prepareIncoming(dependencies, slug, html);
  if (incoming.kind !== 'ready') {
    return incoming;
  }

  const created = await dependencies.repository.create({
    slug,
    title: incoming.title,
    html: incoming.html,
    template: incoming.template,
    author,
  });
  if (created === 'slug-taken') {
    return { kind: 'already-exists' };
  }
  dependencies.resumeChanges.notify(slug);
  return { kind: 'created' };
}

type Rejection =
  | { readonly kind: 'invalid-slug' }
  | { readonly kind: 'too-large'; readonly bytes: number; readonly limitBytes: number }
  | { readonly kind: 'invalid-document'; readonly problems: readonly string[] };

/**
 * The checks of an incoming document that need no I/O: the slug, the size of what was sent, then the validation
 * boundary (ADR-0024). Gives the document as it will be stored, canonical and with the template styles in, the
 * template it names and its title; or why it may not be stored.
 */
function prepareIncoming(
  { templates, parseHtml }: ResumeDocumentDependencies,
  slug: string,
  html: string,
):
  | {
      readonly kind: 'ready';
      readonly html: CanonicalResumeHtml;
      readonly template: TemplateRef;
      readonly title: string;
    }
  | Rejection {
  if (!isValidResumeSlug(slug)) {
    return { kind: 'invalid-slug' };
  }
  const bytes = new TextEncoder().encode(html).byteLength;
  if (bytes > MAX_RESUME_DOCUMENT_BYTES) {
    return { kind: 'too-large', bytes, limitBytes: MAX_RESUME_DOCUMENT_BYTES };
  }
  const document = validateResumeDocument(html, templates, parseHtml);
  if (document.kind === 'invalid') {
    return { kind: 'invalid-document', problems: document.problems };
  }
  // The boundary requires resume:title, so the fallback to the slug never shows in practice.
  const title = readResumeTitle(document.html) ?? slug;
  return { kind: 'ready', html: document.html, template: document.template, title };
}
