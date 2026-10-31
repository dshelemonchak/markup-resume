import { checkMarkup, type HtmlParser } from '../markup/markup.ts';
import { type TemplateCatalog, withTemplateStyles } from '../template/template.ts';
import { checkDocumentBasics } from './document-basics.ts';
import { readMetaTag } from './meta-tags.ts';

/**
 * HTML that passed validateResumeDocument: canonical, checked against its template, with the template styles in. The
 * brand exists only for the compiler; at run time it is a plain string. Only validateResumeDocument makes one, so a
 * storage port that asks for it cannot be handed unchecked HTML.
 */
export type CanonicalResumeHtml = string & { readonly __brand: 'CanonicalResumeHtml' };

/** A template a document names in resume:template, "classic@0.0.3" split at the last "@". */
export interface TemplateRef {
  readonly name: string;
  readonly version: string;
}

export type ResumeDocumentValidation =
  | { readonly kind: 'invalid'; readonly problems: readonly string[] }
  | { readonly kind: 'valid'; readonly html: CanonicalResumeHtml; readonly template: TemplateRef };

/**
 * The one way in for a CV document, whatever sent it (ADR-0024). The template styles are put in, the result is
 * parsed once, and that one parse gives both the tree the checks look at and the canonical HTML that is returned:
 * what is checked is exactly what gets stored and rendered. Dangerous markup is rejected, never stripped, so
 * whoever sent the document learns what to fix.
 */
export function validateResumeDocument(
  html: string,
  catalog: TemplateCatalog,
  parse: HtmlParser,
): ResumeDocumentValidation {
  const problems = [...checkDocumentBasics(html)];
  const styled = withTemplateStyles(html, catalog);
  if (styled.kind === 'problem') {
    problems.push(styled.problem);
  }
  const ref = readMetaTag(html, 'resume:template');
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
  // The one place a string becomes CanonicalResumeHtml: it is the canonical form of the tree that passed the checks.
  return { kind: 'valid', html: parsed.html as CanonicalResumeHtml, template };
}

/** "classic@0.0.3" as a name and a version, or null when it is not in that form. */
function templateRef(ref: string): TemplateRef | null {
  const at = ref.lastIndexOf('@');
  if (at <= 0 || at === ref.length - 1) {
    return null;
  }
  return { name: ref.slice(0, at), version: ref.slice(at + 1) };
}
