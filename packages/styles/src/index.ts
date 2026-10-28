// The style library (ADR-0006): CV templates with their rules for Claude, plus the fonts and icons they use.
// Template files are read on every call, not cached: the MCP server runs for as long as Claude is open, and
// an edit to a template's files must reach Claude without restarting it. A new template (a new entry in
// TEMPLATES) still needs a restart, as does the template list in the MCP handshake.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = new URL('../', import.meta.url);

/** Folders whose files cv-kit serves at /api/v1/fonts/<file> and /api/v1/icons/<file>. */
export const fontsDir = fileURLToPath(new URL('fonts/inter/', PACKAGE_DIR));
export const iconsDir = fileURLToPath(new URL('icons/', PACKAGE_DIR));

/**
 * The templates by reference: what a document names in <meta name="cv:template">, "<name>@<semver>",
 * mapped to its folder under templates/.
 */
const TEMPLATES: ReadonlyMap<string, string> = new Map([['classic@0.0.2', 'classic']]);

/** One file of a template, or null when there is no template with this reference. */
function read(
  ref: string,
  file: 'template.css' | 'rules.md' | 'example.html' | 'schema.json',
): string | null {
  const folder = TEMPLATES.get(ref);
  return folder ? readFileSync(new URL(`templates/${folder}/${file}`, PACKAGE_DIR), 'utf8') : null;
}

/** The templates as cv-kit's TemplateCatalog port expects them. */
export const templateCatalog = {
  refs: (): readonly string[] => [...TEMPLATES.keys()],
  /** The CSS cv-kit inserts into the document. */
  styles: (ref: string): string | null => read(ref, 'template.css'),
  /** The design system for whoever writes the document (Claude), and a complete example built by it. */
  guide: (ref: string): { rules: string; example: string } | null => {
    const rules = read(ref, 'rules.md');
    const example = read(ref, 'example.html');
    return rules !== null && example !== null ? { rules, example } : null;
  },
  /** The markup cv-kit accepts for documents on this template. */
  schema: (ref: string): TemplateSchema | null => {
    const json = read(ref, 'schema.json');
    return json === null ? null : (JSON.parse(json) as TemplateSchema);
  },
};

/** The shape of schema.json; cv-kit's MarkupSchema in packages/app/src/domain/cv-markup.ts. */
export interface TemplateSchema {
  readonly plainElements: readonly string[];
  readonly classes: Readonly<
    Record<
      string,
      {
        readonly tags: readonly string[];
        readonly parents: readonly string[];
        readonly first?: string;
        readonly oneOf?: readonly string[];
      }
    >
  >;
}
