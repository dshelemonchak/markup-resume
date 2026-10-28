import { checkCvDocument, type CvRepository, type CvSummary, isValidCvId } from '../domain/index.ts';

/** All CVs, most recently changed first. */
export async function listCvs(repository: CvRepository): Promise<readonly CvSummary[]> {
  const cvs = await repository.list();
  return [...cvs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type CvDocumentResult =
  | { readonly kind: 'found'; readonly html: string }
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'not-found' };

/** One CV document by id. The id comes from outside (URL, MCP call), so it is validated here. */
export async function getCvDocument(repository: CvRepository, id: string): Promise<CvDocumentResult> {
  if (!isValidCvId(id)) return { kind: 'invalid-id' };
  const html = await repository.getDocument(id);
  return html === null ? { kind: 'not-found' } : { kind: 'found', html };
}

/** Upper bound for one document, in UTF-8 bytes. Real CVs are tens of kilobytes; this stops runaway output. */
export const MAX_CV_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type SaveCvDocumentResult =
  { readonly kind: 'saved' } | { readonly kind: 'unchanged' } | { readonly kind: 'not-found' } | Rejection;

/**
 * Replaces the document of an existing CV. Checks that need no I/O run first; a document identical to the
 * stored one is not written, so it adds no history entry.
 */
export async function saveCvDocument(
  repository: CvRepository,
  id: string,
  html: string,
): Promise<SaveCvDocumentResult> {
  const rejection = checkIncoming(id, html);
  if (rejection) return rejection;

  const current = await repository.getDocument(id);
  if (current === null) return { kind: 'not-found' };
  if (current === html) return { kind: 'unchanged' };
  await repository.save(id, html);
  return { kind: 'saved' };
}

export type CreateCvDocumentResult =
  { readonly kind: 'created' } | { readonly kind: 'already-exists' } | Rejection;

/** Stores a new CV under a new id, with the same checks as saveCvDocument. Never replaces an existing CV. */
export async function createCvDocument(
  repository: CvRepository,
  id: string,
  html: string,
): Promise<CreateCvDocumentResult> {
  const rejection = checkIncoming(id, html);
  if (rejection) return rejection;
  return (await repository.create(id, html)) ? { kind: 'created' } : { kind: 'already-exists' };
}

type Rejection =
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'too-large'; readonly bytes: number; readonly limitBytes: number }
  | { readonly kind: 'invalid-document'; readonly problems: readonly string[] };

/** The checks of an incoming document that need no I/O; null when it may be stored. */
function checkIncoming(id: string, html: string): Rejection | null {
  if (!isValidCvId(id)) return { kind: 'invalid-id' };
  const bytes = new TextEncoder().encode(html).byteLength;
  if (bytes > MAX_CV_DOCUMENT_BYTES) return { kind: 'too-large', bytes, limitBytes: MAX_CV_DOCUMENT_BYTES };
  const problems = checkCvDocument(html);
  if (problems.length > 0) return { kind: 'invalid-document', problems };
  return null;
}
