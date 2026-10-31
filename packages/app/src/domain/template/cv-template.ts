import { checkMarkup, type MarkupSchema, type ParseMarkup } from '../markup/cv-markup.ts';
import { readCvMeta } from '../document/cv-meta.ts';

/** Port: the templates a CV can name in <meta name="cv:template" content="classic@0.0.2"> (ADR-0006). */
export interface TemplateCatalog {
  /** Every reference a document may name, e.g. "classic@0.0.2". */
  refs(): readonly string[];
  /** The template's CSS, or null when no template has this reference. */
  styles(ref: string): string | null;
  /** How to write a document for the template (the design system), or null when there is no such template. */
  guide(ref: string): TemplateGuide | null;
  /** The markup the template accepts, or null when there is no such template. */
  schema(ref: string): MarkupSchema | null;
}

/** What whoever writes a CV (Claude) needs to follow a template. */
export interface TemplateGuide {
  /** Structure, class names and text rules, in Markdown. */
  readonly rules: string;
  /** A complete document on fictional data, built by the rules. */
  readonly example: string;
}

export type TemplateStylesResult =
  { readonly kind: 'styled'; readonly html: string } | { readonly kind: 'problem'; readonly problem: string };

const LIBRARY_STYLE = /[ \t]*<style\b[^>]*\bid\s*=\s*["']cv-lib["'][^>]*>[\s\S]*?<\/style>[ \t]*\r?\n?/gi;
const HEAD_CLOSE = /([ \t]*)<\/head>/i;

/**
 * Puts the CSS of the document's template into <style id="cv-lib">, replacing whatever was there: the block is
 * owned by Markup Résumé, not by the sender (ADR-0006). A document that names no template is returned as it is.
 */
export function withTemplateStyles(html: string, catalog: TemplateCatalog): TemplateStylesResult {
  const ref = readCvMeta(html, 'cv:template');
  if (ref === null) return { kind: 'styled', html };
  const css = catalog.styles(ref);
  if (css === null) {
    const known = catalog.refs().map((known) => `"${known}"`);
    return {
      kind: 'problem',
      problem: `Unknown template "${ref}" in cv:template; use one of: ${known.join(', ')}.`,
    };
  }
  const withoutStyles = html.replace(LIBRARY_STYLE, '');
  const head = HEAD_CLOSE.exec(withoutStyles);
  if (!head) return { kind: 'problem', problem: 'The document must have a <head> for the template styles.' };
  const indent = head[1] ?? '';
  const block = `${indent}  <style id="cv-lib" data-cv-lib="${ref}">\n${css.trimEnd()}\n${indent}  </style>\n`;
  return {
    kind: 'styled',
    html: withoutStyles.slice(0, head.index) + block + withoutStyles.slice(head.index),
  };
}

/**
 * Checks the markup of a document against the schema of the template it names. A document without a template,
 * or with an unknown one (withTemplateStyles reports that), has nothing to be checked against.
 */
export function checkTemplateMarkup(
  html: string,
  catalog: TemplateCatalog,
  parse: ParseMarkup,
): readonly string[] {
  const ref = readCvMeta(html, 'cv:template');
  const schema = ref === null ? null : catalog.schema(ref);
  return schema ? checkMarkup(parse(html).tree, schema) : [];
}
