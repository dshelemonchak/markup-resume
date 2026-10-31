import { readMetaTag } from './meta-tags.ts';
import { readResumeTitle } from './resume-title.ts';

const DOCTYPE_AT_START = /^\s*<!doctype html\b/i;
const HTML_CLOSE_AT_END = /<\/html>\s*$/i;

/**
 * Basic sanity checks for a whole CV document before it replaces the stored one. The main risk is a
 * truncated rewrite (ADR-0003), hence the checks at both ends. Returns the problems found, phrased so
 * that whoever sent the document (often Claude) can fix them; an empty list means the document passes.
 */
export function checkDocumentBasics(html: string): readonly string[] {
  const problems: string[] = [];
  if (!DOCTYPE_AT_START.test(html)) {
    problems.push('The document must start with <!doctype html>.');
  }
  if (!HTML_CLOSE_AT_END.test(html)) {
    problems.push('The document must end with </html>; it may have been cut off.');
  }
  if (readResumeTitle(html) === null) {
    problems.push('The document must keep <meta name="resume:title" content="…"> with a non-empty title.');
  }
  if (readMetaTag(html, 'resume:template') === null) {
    problems.push('The document must name its template in <meta name="resume:template" content="…">.');
  }
  return problems;
}
