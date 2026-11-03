import type { MarkupSchema } from '../markup/markup.ts';
import { readMetaTag } from '../document/meta-tags.ts';

/**
 * The versions of a template's look: the designed one, and one column for applicant tracking systems (ADR-0005).
 * Both style the same document; storage always holds the visual one.
 */
export type TemplateVariant = 'visual' | 'ats';

/** Port: the templates a CV can name in <meta name="resume:template" content="classic@0.0.3"> (ADR-0006). */
export interface TemplateCatalog {
  /** Every reference a document may name, e.g. "classic@0.0.3". */
  refs(): readonly string[];
  /** The template's CSS for the variant (visual by default), or null when there is no such template or variant. */
  styles(ref: string, variant?: TemplateVariant): string | null;
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

/**
 * Sidebar sections that the ATS version moves after the main column: with years of experience, a reader expects the
 * experience right after the skills. They hold no nested <section>, so the first </section> closes each.
 */
const ATS_LAST_SECTIONS = [
  /[ \t]*<section class="resume-education">[\s\S]*?<\/section>[ \t]*\r?\n?/,
  /[ \t]*<section class="resume-languages">[\s\S]*?<\/section>[ \t]*\r?\n?/,
];

const LIBRARY_STYLE = /[ \t]*<style\b[^>]*\bid\s*=\s*["']resume-lib["'][^>]*>[\s\S]*?<\/style>[ \t]*\r?\n?/gi;
const HEAD_CLOSE = /([ \t]*)<\/head>/i;

/**
 * Puts the CSS of the document's template into <style id="resume-lib">, replacing whatever was there: the block is
 * owned by Markup Résumé, not by the sender (ADR-0006). A document that names no template is returned as it is.
 * The ATS variant restyles a stored document for showing or exporting it as ATS; it is never stored.
 */
export function withTemplateStyles(
  html: string,
  catalog: TemplateCatalog,
  variant: TemplateVariant = 'visual',
): TemplateStylesResult {
  const ref = readMetaTag(html, 'resume:template');
  if (ref === null) {
    return { kind: 'styled', html };
  }
  const css = catalog.styles(ref, variant);
  if (css === null && variant === 'ats' && catalog.styles(ref) !== null) {
    return { kind: 'problem', problem: `The template "${ref}" has no ATS version.` };
  }
  if (css === null) {
    const known = catalog.refs().map((known) => `"${known}"`);
    return {
      kind: 'problem',
      problem: `Unknown template "${ref}" in resume:template; use one of: ${known.join(', ')}.`,
    };
  }
  const withoutStyles = html.replace(LIBRARY_STYLE, '');
  const head = HEAD_CLOSE.exec(withoutStyles);
  if (!head) {
    return { kind: 'problem', problem: 'The document must have a <head> for the template styles.' };
  }
  const indent = head[1] ?? '';
  const block = `${indent}  <style id="resume-lib" data-resume-lib="${ref}">\n${css.trimEnd()}\n${indent}  </style>\n`;
  const styled = withoutStyles.slice(0, head.index) + block + withoutStyles.slice(head.index);
  return { kind: 'styled', html: variant === 'ats' ? asAtsCopy(styled) : styled };
}

const SKILL_LIST = /<ul class="resume-skill-list">[\s\S]*?<\/ul>/g;

/** The copy of a document that the ATS version shows and exports: sections in ATS order, skills as text lines. */
function asAtsCopy(html: string): string {
  return withSkillCommas(inAtsOrder(html));
}

/**
 * Each skill list as one comma-separated line, which parsers read as text rather than a table. The commas go into
 * the markup, not into CSS, so the PDF check finds in the page's text exactly what the PDF holds.
 */
function withSkillCommas(html: string): string {
  return html.replace(SKILL_LIST, (list) => list.replace(/<\/li>(?=\s*<li>)/g, ',</li>'));
}

/**
 * The ATS version's reading order: contacts and skills, the experience (and open source), then education and
 * languages. In one column the page shows the document's order, and the PDF check compares the text with it, so the
 * sections are moved in the markup, not by CSS. Only the shown or exported copy changes, never the stored document.
 */
function inAtsOrder(html: string): string {
  let rest = html;
  const moved: string[] = [];
  for (const section of ATS_LAST_SECTIONS) {
    const match = section.exec(rest);
    if (match) {
      moved.push(match[0]);
      rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length);
    }
  }
  // The main column comes after the sidebar, so the last section left is the last one of the main column.
  const end = rest.lastIndexOf('</section>');
  if (moved.length === 0 || end === -1) {
    return html;
  }
  const at = end + '</section>'.length;
  return `${rest.slice(0, at)}\n${moved.join('').replace(/\n$/, '')}${rest.slice(at)}`;
}
