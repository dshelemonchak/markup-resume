// The style library (ADR-0006): CV templates with their rules for Claude, plus the fonts and icons they use.
// Read from disk once, when the package is first imported.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Template {
  /** What a document names in <meta name="cv:template">: "<name>@<semver>", e.g. "classic@0.0.1". */
  readonly ref: string;
  readonly css: string;
  /** The design system for whoever writes the document (Claude): structure, classes, text rules. */
  readonly rules: string;
  /** A complete document on fictional data, built by the rules. */
  readonly example: string;
}

const PACKAGE_DIR = new URL('../', import.meta.url);

/** Folders whose files cv-kit serves at /api/v1/fonts/<file> and /api/v1/icons/<file>. */
export const fontsDir = fileURLToPath(new URL('fonts/inter/', PACKAGE_DIR));
export const iconsDir = fileURLToPath(new URL('icons/', PACKAGE_DIR));

function loadTemplate(name: string, version: string): Template {
  const read = (file: string) => readFileSync(new URL(`templates/${name}/${file}`, PACKAGE_DIR), 'utf8');
  return {
    ref: `${name}@${version}`,
    css: read('template.css'),
    rules: read('rules.md'),
    example: read('example.html'),
  };
}

export const templates: readonly Template[] = [loadTemplate('classic', '0.0.1')];

/** The templates as cv-kit's TemplateCatalog port expects them. */
export const templateCatalog = {
  refs: (): readonly string[] => templates.map((template) => template.ref),
  styles: (ref: string): string | null => templates.find((template) => template.ref === ref)?.css ?? null,
};
