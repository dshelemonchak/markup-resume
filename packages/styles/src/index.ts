// The style library (ADR-0006): CV templates with their rules for Claude, plus the fonts and icons they use.
// Template files are read on every call, not cached: the MCP server runs for as long as Claude is open, and
// an edit to a template's files must reach Claude without restarting it. A new template (a new entry in
// TEMPLATES) still needs a restart, as does the template list in the MCP handshake.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = new URL('../', import.meta.url);

/** Folders whose files Markup Résumé serves at /api/v1/fonts/<file> and /api/v1/icons/<file>. */
export const fontsDir = fileURLToPath(new URL('fonts/inter/', PACKAGE_DIR));
export const iconsDir = fileURLToPath(new URL('icons/', PACKAGE_DIR));

/**
 * The templates by reference: "<name>@<semver>" mapped to its folder under templates/. This is the latest version
 * of each template; a document may also name an earlier one (see folderOf).
 */
const TEMPLATES: ReadonlyMap<string, string> = new Map([
  ['classic@0.0.4', 'classic'],
  ['dev-classic@0.0.2', 'dev-classic'],
]);

/** "classic@0.0.3" as its name and version numbers, or null when it is not that shape. */
function parseRef(ref: string): { name: string; version: number[] } | null {
  const match = /^([\w-]+)@(\d+)\.(\d+)\.(\d+)$/.exec(ref);
  return match ? { name: match[1]!, version: [Number(match[2]), Number(match[3]), Number(match[4])] } : null;
}

const olderOrSame = (a: number[], b: number[]): boolean =>
  a[0]! < b[0]! || (a[0] === b[0] && (a[1]! < b[1]! || (a[1] === b[1] && a[2]! <= b[2]!)));

/**
 * A template's folder under templates/. A document that names an earlier version of a template (a stored CV from
 * before a minor or patch change) gets the latest one with the same major version: those changes stay compatible,
 * and a breaking change takes a new major, which leaves the old references unknown. A later version than the
 * latest is unknown.
 */
function folderOf(ref: string): string | undefined {
  const exact = TEMPLATES.get(ref);
  const wanted = parseRef(ref);
  if (exact !== undefined || wanted === null) {
    return exact;
  }
  for (const [latestRef, folder] of TEMPLATES) {
    const latest = parseRef(latestRef);
    if (
      latest?.name === wanted.name &&
      latest.version[0] === wanted.version[0] &&
      olderOrSame(wanted.version, latest.version)
    ) {
      return folder;
    }
  }
  return undefined;
}

/**
 * The versions of a template's look: the designed one, and one column for applicant tracking systems
 * (ADR-0005). Both style the same document.
 */
export type TemplateVariant = 'visual' | 'ats';

/** One file of a template, or null when there is no template with this reference. */
function read(
  ref: string,
  file: 'template.css' | 'rules.md' | 'example.html' | 'schema.json',
): string | null {
  const folder = folderOf(ref);
  return folder ? readFileSync(new URL(`templates/${folder}/${file}`, PACKAGE_DIR), 'utf8') : null;
}

/** The templates as Markup Résumé's TemplateCatalog port expects them. */
export const templateCatalog = {
  /** The latest version of each template: what a new CV names. */
  refs: (): readonly string[] => [...TEMPLATES.keys()],
  /**
   * The CSS Markup Résumé inserts into the document. The ATS variant is the template's CSS with ats/<name>.css
   * after it; null when the template has no ATS version.
   */
  styles: (ref: string, variant: TemplateVariant = 'visual'): string | null => {
    const css = read(ref, 'template.css');
    if (css === null || variant === 'visual') {
      return css;
    }
    const ats = new URL(`ats/${ref.split('@')[0]!}.css`, PACKAGE_DIR);
    return existsSync(ats) ? `${css}\n${readFileSync(ats, 'utf8')}` : null;
  },
  /** The design system for whoever writes the document (Claude), and a complete example built by it. */
  guide: (ref: string): { rules: string; example: string } | null => {
    const rules = read(ref, 'rules.md');
    const example = read(ref, 'example.html');
    return rules !== null && example !== null ? { rules, example } : null;
  },
  /** The markup accepted for documents on this template. */
  schema: (ref: string): TemplateSchema | null => {
    const json = read(ref, 'schema.json');
    return json === null ? null : (JSON.parse(json) as TemplateSchema);
  },
};

/** The shape of schema.json; Markup Résumé's MarkupSchema in packages/app/src/domain/markup/markup.ts. */
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
