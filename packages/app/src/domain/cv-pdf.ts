import type { CvId } from './cv.ts';

/** What the rendered page holds, to compare the PDF with. */
export interface PageSnapshot {
  /** The document's <title>, which names the PDF file. */
  readonly title: string;
  /** Visible text of each text block (headings, paragraphs, list items), in document order. */
  readonly blocks: readonly string[];
  readonly links: readonly PageLink[];
}

export interface PageLink {
  readonly href: string;
  readonly text: string;
}

export interface RenderedCv {
  readonly pdf: Uint8Array;
  readonly page: PageSnapshot;
}

/** Port: renders a stored CV in a browser, as the viewer shows it, into a PDF (ADR-0008). */
export type RenderCv = (id: CvId) => Promise<RenderedCv>;

export interface PdfFont {
  readonly name: string;
  /** E.g. "CID TrueType" or "Type 3". */
  readonly type: string;
  readonly embedded: boolean;
  /** Has a map back to Unicode, so its text can be copied. */
  readonly unicode: boolean;
}

/** What a PDF reader gets out of the file. */
export interface PdfFacts {
  readonly fonts: readonly PdfFont[];
  /** The text in content-stream order, as most PDF parsers (and ATS) read it; lines end with "\n". */
  readonly text: string;
  /** Targets of the clickable links. */
  readonly links: readonly string[];
}

/** Port: reads fonts, text and links out of a PDF (ADR-0009). */
export type InspectPdf = (pdf: Uint8Array) => Promise<PdfFacts>;

const MAX_LISTED = 10;

/**
 * Compares a PDF with the page it was printed from, for what goes wrong when its text is copied or parsed
 * (ADR-0009): fonts that give no text back, words split or merged by letter spacing, text that is lost or
 * added, blocks that come apart or out of order (columns read across), and links that do not click. Returns
 * problems phrased for the user; an empty list means the PDF reads like the page.
 */
export function checkPdf(page: PageSnapshot, pdf: PdfFacts): readonly string[] {
  return [
    ...checkFonts(pdf.fonts),
    ...checkWords(page, pdf),
    ...checkBlocks(page, pdf),
    ...checkLinks(page, pdf),
  ];
}

function checkFonts(fonts: readonly PdfFont[]): string[] {
  return fonts.flatMap((font) => {
    if (/type ?3/i.test(font.type)) {
      return [`The font ${font.name} is drawn as shapes (Type 3): its text cannot be copied or searched.`];
    }
    const problems: string[] = [];
    if (!font.embedded)
      problems.push(`The font ${font.name} is not embedded: the PDF looks different elsewhere.`);
    if (!font.unicode) problems.push(`The font ${font.name} has no Unicode map: its text copies as garbage.`);
    return problems;
  });
}

/** Every word of the page is in the PDF text exactly as often, and nothing else is. */
function checkWords(page: PageSnapshot, pdf: PdfFacts): string[] {
  const expected = count(page.blocks.flatMap(words));
  const found = count(pdfWords(pdf.text, expected));
  const missing = difference(expected, found);
  const extra = difference(found, expected);
  const problems: string[] = [];
  if (missing.length > 0)
    problems.push(`Words of the page that the PDF text does not have: ${list(missing)}.`);
  if (extra.length > 0) problems.push(`Words in the PDF text that the page does not have: ${list(extra)}.`);
  return problems;
}

/**
 * Each block comes out of the PDF in one piece, and the blocks come in page order: a two-column layout must
 * not be read across the columns. Compared without whitespace, so line breaks inside a block do not matter.
 */
function checkBlocks(page: PageSnapshot, pdf: PdfFacts): string[] {
  const text = squeeze(pdf.text);
  const problems: string[] = [];
  let cursor = 0;
  for (const block of page.blocks) {
    const wanted = squeeze(block);
    const at = text.indexOf(wanted, cursor);
    if (at !== -1) {
      cursor = at + wanted.length;
    } else if (text.includes(wanted)) {
      problems.push(
        `"${excerpt(block)}" comes earlier in the PDF text than on the page: the reading order is off.`,
      );
    } else {
      problems.push(
        `"${excerpt(block)}" does not come out of the PDF in one piece: other text cuts into it.`,
      );
    }
  }
  return problems.length > MAX_LISTED
    ? [...problems.slice(0, MAX_LISTED), `…and ${problems.length - MAX_LISTED} more blocks.`]
    : problems;
}

function checkLinks(page: PageSnapshot, pdf: PdfFacts): string[] {
  const clickable = new Set(pdf.links);
  return page.links
    .filter((link) => !clickable.has(link.href))
    .map((link) => `The link "${link.text}" (${link.href}) cannot be clicked in the PDF.`);
}

/** Typography a PDF may write differently from the page, mapped to one form. */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-') // hyphens, dashes, minus
    .replace(/[\u2018\u2019\u201B]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D\u201F]/g, '"') // curly double quotes
    .replace(/[\u00A0\u202F\u2009]/g, ' ') // no-break and thin spaces
    .replace(/[\u00AD\u200B]/g, ''); // soft hyphen, zero-width space
}

function words(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

/**
 * The words of the PDF text. A word broken after its hyphen at the end of a line ("end-" / "to-end") is
 * joined back when the page has the whole word.
 */
function pdfWords(text: string, pageWords: ReadonlyMap<string, number>): string[] {
  const result: string[] = [];
  for (const line of normalize(text).split('\n')) {
    const lineWords = line.split(/\s+/).filter(Boolean);
    const previous = result.at(-1);
    if (previous?.endsWith('-') && lineWords[0] && pageWords.has(previous + lineWords[0])) {
      result[result.length - 1] = previous + lineWords.shift()!;
    }
    result.push(...lineWords);
  }
  return result;
}

function squeeze(text: string): string {
  return normalize(text).replace(/\s+/g, '');
}

function count(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Items with more occurrences in `a` than in `b`, each listed once per extra occurrence. */
function difference(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): string[] {
  return [...a].flatMap(([item, times]) => Array<string>(Math.max(0, times - (b.get(item) ?? 0))).fill(item));
}

function list(items: readonly string[]): string {
  const shown = items.slice(0, MAX_LISTED).map((item) => `"${item}"`);
  return items.length > MAX_LISTED
    ? `${shown.join(', ')} and ${items.length - MAX_LISTED} more`
    : shown.join(', ');
}

function excerpt(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
