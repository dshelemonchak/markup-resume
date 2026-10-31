/** An element of a parsed document; text and comments are left out, since the checks only look at markup. */
export interface MarkupElement {
  /** Lower-case tag name. */
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly MarkupElement[];
}

/** A document after one parse: the element tree for the checks, and the same parse serialized back. */
export interface ParsedHtml {
  /** The <html> element. */
  readonly tree: MarkupElement;
  /** The document as a browser understands it, serialized back: canonical HTML (ADR-0024). */
  readonly html: string;
}

/** Port: turns HTML into the element tree a browser would build from it, and that tree as canonical HTML. */
export type HtmlParser = (html: string) => ParsedHtml;

/** The markup a template accepts (its schema.json). */
export interface MarkupSchema {
  /** Tags an element may have without a class, inside the page. */
  readonly plainElements: readonly string[];
  readonly classes: Readonly<Record<string, ClassRule>>;
}

export interface ClassRule {
  /** Tags the class may sit on. */
  readonly tags: readonly string[];
  /** Classes of the nearest classed ancestor it may sit in; empty for the page itself. */
  readonly parents: readonly string[];
  /** Class of the element that must open it. */
  readonly first?: string;
  /** Exactly one of these classes must sit on the same element, e.g. the kind of a contact. */
  readonly oneOf?: readonly string[];
}

const HEAD_TAGS = new Set(['meta', 'title', 'style']);
/** The only <meta name> values a document may carry; anything else, http-equiv above all, is kept out. */
const META_NAMES = new Set(['resume:title', 'resume:template', 'viewport', 'author']);
const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  '*': ['class'],
  a: ['class', 'href'],
  time: ['class', 'datetime'],
};
const HREF = /^(https?:|mailto:|tel:)/i;
const MAX_PROBLEMS = 20;

/**
 * Checks a templated document against the template's schema: every element in the page is either a known class
 * on an allowed tag, inside an allowed parent, or a plain element; nothing else gets in (no scripts, images,
 * inline styles, other style blocks or event handlers). Returns problems phrased for whoever wrote the
 * document (often Claude); an empty list means it passes.
 */
export function checkMarkup(html: MarkupElement, schema: MarkupSchema): readonly string[] {
  const problems: string[] = [];
  const head = html.children.find((child) => child.tag === 'head');
  const body = html.children.find((child) => child.tag === 'body');

  for (const element of head?.children ?? []) {
    if (!HEAD_TAGS.has(element.tag)) problems.push(`<${element.tag}> is not allowed in <head>.`);
    else if (element.tag === 'style' && element.attributes.get('id') !== 'resume-lib') {
      problems.push(
        '<style> is not allowed: the template does all the styling (Markup Résumé adds <style id="resume-lib">).',
      );
    } else if (element.tag === 'meta' && !isAllowedMeta(element)) {
      problems.push(
        `<meta> may only carry charset, or name and content with a name of ${[...META_NAMES].join(', ')}.`,
      );
    }
  }

  const pages = Object.entries(schema.classes).filter(([, rule]) => rule.parents.length === 0);
  const [pageClass] = pages.map(([name]) => name);
  const content = body?.children ?? [];
  if (content.length !== 1 || !classesOf(content[0]!).includes(pageClass ?? '')) {
    problems.push(`<body> must hold exactly one element: the page, <main class="${pageClass ?? ''}">.`);
  }
  for (const element of content) visit(element, null, schema, problems);

  if (problems.length <= MAX_PROBLEMS) return problems;
  return [...problems.slice(0, MAX_PROBLEMS), `…and ${problems.length - MAX_PROBLEMS} more problems.`];
}

function visit(element: MarkupElement, parentClass: string | null, schema: MarkupSchema, problems: string[]) {
  const where = parentClass ? ` in .${parentClass}` : '';
  const own = classesOf(element);
  const known = own.filter((name) => name in schema.classes);
  const ownClass = known[0] ?? null;
  const rule = ownClass ? schema.classes[ownClass] : undefined;

  checkAttributes(element, where, problems);

  if (known.length > 1) {
    problems.push(`<${element.tag}${where}> has ${known.map((name) => `.${name}`).join(' and ')}; use one.`);
  }
  for (const name of own) {
    if (!known.includes(name) && !rule?.oneOf?.includes(name)) {
      problems.push(
        `Unknown class "${name}" on <${element.tag}${where}>; use only the classes from read_template.`,
      );
    }
  }

  if (ownClass && rule) {
    if (!rule.tags.includes(element.tag)) {
      problems.push(`.${ownClass} goes on <${rule.tags.join('> or <')}>, not on <${element.tag}>.`);
    }
    if (rule.parents.length > 0 && !rule.parents.includes(parentClass ?? '')) {
      const allowed = rule.parents.map((name) => `.${name}`).join(' or ');
      problems.push(
        `.${ownClass} is ${parentClass ? `inside .${parentClass}` : 'outside the page'}; it belongs in ${allowed}.`,
      );
    }
    if (rule.first) {
      const first = element.children[0];
      if (!first || !classesOf(first).includes(rule.first)) {
        const tag = schema.classes[rule.first]?.tags[0] ?? 'h2';
        problems.push(`.${ownClass} must start with its heading, <${tag} class="${rule.first}">.`);
      }
    }
    if (rule.oneOf) {
      const kinds = own.filter((name) => rule.oneOf?.includes(name));
      if (kinds.length !== 1) {
        problems.push(`.${ownClass}${where} needs exactly one kind class: ${rule.oneOf.join(', ')}.`);
      }
    }
  } else if (!parentClass) {
    problems.push(`<${element.tag}> is outside the page; everything goes inside <main class="resume-page">.`);
  } else if (!schema.plainElements.includes(element.tag)) {
    const templateTag = Object.values(schema.classes).some((classRule) =>
      classRule.tags.includes(element.tag),
    );
    if (!templateTag) problems.push(`<${element.tag}${where}> is not allowed.`);
    // With only unknown classes, the "Unknown class" problem above already says what to fix.
    else if (own.length === 0) problems.push(`<${element.tag}${where}> needs a class from the template.`);
  }

  for (const child of element.children) visit(child, ownClass ?? parentClass, schema, problems);
}

function checkAttributes(element: MarkupElement, where: string, problems: string[]) {
  const allowed = ATTRIBUTES[element.tag] ?? ATTRIBUTES['*']!;
  for (const [name, value] of element.attributes) {
    if (name === 'style') {
      problems.push(
        `The style attribute on <${element.tag}${where}> is not allowed: the template does the styling.`,
      );
    } else if (!allowed.includes(name)) {
      problems.push(`The ${name} attribute on <${element.tag}${where}> is not allowed.`);
    } else if (name === 'href' && !HREF.test(value.trim())) {
      problems.push(`The link "${value}"${where} must start with https://, mailto: or tel:.`);
    }
  }
}

/**
 * A <meta> with charset alone, or with exactly name and content and an allowed name. Other attributes would let a
 * document act on its own: <meta http-equiv="refresh"> navigates the viewer away without any script.
 */
function isAllowedMeta(element: MarkupElement): boolean {
  const { attributes } = element;
  if (attributes.size === 1 && attributes.has('charset')) {
    return true;
  }
  const name = attributes.get('name');
  return attributes.size === 2 && attributes.has('content') && name !== undefined && META_NAMES.has(name);
}

function classesOf(element: MarkupElement): string[] {
  return (element.attributes.get('class') ?? '').split(/\s+/).filter(Boolean);
}
