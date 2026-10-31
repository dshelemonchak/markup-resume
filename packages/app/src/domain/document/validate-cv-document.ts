import { checkMarkup, type ParseMarkup } from '../markup/cv-markup.ts';
import { type TemplateCatalog, withTemplateStyles } from '../template/cv-template.ts';
import { checkCvDocument } from './cv-document.ts';
import { readCvMeta } from './cv-meta.ts';

/** A template a document names in cv:template, "classic@0.0.2" split at the last "@". */
export interface CvTemplateRef {
  readonly name: string;
  readonly version: string;
}

export type CvDocumentValidation =
  | { readonly kind: 'invalid'; readonly problems: readonly string[] }
  | { readonly kind: 'valid'; readonly html: string; readonly template: CvTemplateRef };

/**
 * The one way in for a CV document, whatever sent it (ADR-0024). The template styles are put in, the result is
 * parsed once, and that one parse gives both the tree the checks look at and the canonical HTML that is returned:
 * what is checked is exactly what gets stored and rendered. Dangerous markup is rejected, never stripped, so
 * whoever sent the document learns what to fix.
 */
export function validateCvDocument(
  html: string,
  catalog: TemplateCatalog,
  parse: ParseMarkup,
): CvDocumentValidation {
  const problems = [...checkCvDocument(html)];
  const styled = withTemplateStyles(html, catalog);
  if (styled.kind === 'problem') {
    problems.push(styled.problem);
  }
  const ref = readCvMeta(html, 'cv:template');
  const template = ref === null ? null : templateRef(ref);
  if (problems.length > 0 || styled.kind !== 'styled' || ref === null || template === null) {
    return { kind: 'invalid', problems };
  }

  const parsed = parse(styled.html);
  const schema = catalog.schema(ref);
  if (schema) {
    problems.push(...checkMarkup(parsed.tree, schema));
  }
  if (problems.length > 0) {
    return { kind: 'invalid', problems };
  }
  return { kind: 'valid', html: parsed.html, template };
}

/** "classic@0.0.2" as a name and a version, or null when it is not in that form. */
function templateRef(ref: string): CvTemplateRef | null {
  const at = ref.lastIndexOf('@');
  if (at <= 0 || at === ref.length - 1) {
    return null;
  }
  return { name: ref.slice(0, at), version: ref.slice(at + 1) };
}
