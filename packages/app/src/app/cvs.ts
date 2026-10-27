import { type CvRepository, type CvSummary, isValidCvId } from '../domain/index.ts';

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
