/** Templates whose documents used the old "cv" vocabulary, and the version that replaced each with "resume". */
const LEGACY_TEMPLATES: ReadonlyMap<string, string> = new Map([['classic@0.0.2', 'classic@0.0.3']]);

const CLASS_ATTRIBUTE = /(\sclass=")([^"]*)(")/g;
const META_NAME = /(<meta\s[^>]*\bname=")cv:(title|template)(")/g;
const META_CONTENT = /(<meta\s[^>]*\bname="resume:template"[^>]*\bcontent=")([^"]*)(")/g;

/**
 * A document written before the move from "cv" to "resume" (2026-10-31), in the new vocabulary: cv- classes become
 * resume- classes, cv:title and cv:template become resume:title and resume:template, the template reference moves
 * to its new version, and the old template style block is renamed so that the template styles replace it.
 * Expects canonical HTML (attributes in double quotes), as stored documents are; only markup changes, never text.
 */
export function upgradeLegacyVocabulary(html: string): string {
  return html
    .replace(CLASS_ATTRIBUTE, (_, start: string, classes: string, end: string) => {
      const renamed = classes
        .split(' ')
        .map((name) => (name.startsWith('cv-') ? `resume-${name.slice(3)}` : name));
      return `${start}${renamed.join(' ')}${end}`;
    })
    .replace(META_NAME, '$1resume:$2$3')
    .replace(
      META_CONTENT,
      (_, start: string, ref: string, end: string) => `${start}${LEGACY_TEMPLATES.get(ref) ?? ref}${end}`,
    )
    .replace(/(<style\s[^>]*)\bid="cv-lib"/g, '$1id="resume-lib"')
    .replace(/(<style\s[^>]*)\bdata-cv-lib="/g, '$1data-resume-lib="');
}
