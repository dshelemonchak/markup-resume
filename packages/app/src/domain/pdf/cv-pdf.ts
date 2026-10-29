import type { CvId } from '../cv/cv.ts';

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

/**
 * What the PDF check found, as a code with its details: the UI phrases it in the user's language, so the
 * domain holds no wording.
 */
export type PdfProblem =
  /** A font drawn as shapes (Type 3): its text cannot be copied or searched. */
  | { readonly code: 'font-type3'; readonly font: string }
  /** A font that is not embedded: the PDF looks different on other machines. */
  | { readonly code: 'font-not-embedded'; readonly font: string }
  /** A font without a Unicode map: its text copies as garbage. */
  | { readonly code: 'font-no-unicode'; readonly font: string }
  /** Words of the page the PDF text does not have, once per missing occurrence. */
  | { readonly code: 'words-missing'; readonly words: readonly string[] }
  /** Words in the PDF text the page does not have, once per extra occurrence. */
  | { readonly code: 'words-extra'; readonly words: readonly string[] }
  /** A block that comes earlier in the PDF text than on the page: the reading order is off. */
  | { readonly code: 'block-out-of-order'; readonly block: string }
  /** A block that does not come out of the PDF in one piece: other text cuts into it. */
  | { readonly code: 'block-split'; readonly block: string }
  /** A link of the page that cannot be clicked in the PDF. */
  | { readonly code: 'link-not-clickable'; readonly text: string; readonly href: string };

/**
 * Compares a PDF with the page it was printed from, for what goes wrong when its text is copied or parsed
 * (ADR-0009): fonts that give no text back, words split or merged by letter spacing, text that is lost or
 * added, blocks that come apart or out of order (columns read across), and links that do not click. An empty
 * list means the PDF reads like the page.
 */
export function checkPdf(page: PageSnapshot, pdf: PdfFacts): readonly PdfProblem[] {
  return [
    ...checkFonts(pdf.fonts),
    ...checkWords(page, pdf),
    ...checkBlocks(page, pdf),
    ...checkLinks(page, pdf),
  ];
}

function checkFonts(fonts: readonly PdfFont[]): PdfProblem[] {
  return fonts.flatMap((font): PdfProblem[] => {
    if (/type ?3/i.test(font.type)) return [{ code: 'font-type3', font: font.name }];
    const problems: PdfProblem[] = [];
    if (!font.embedded) problems.push({ code: 'font-not-embedded', font: font.name });
    if (!font.unicode) problems.push({ code: 'font-no-unicode', font: font.name });
    return problems;
  });
}

/** Every word of the page is in the PDF text exactly as often, and nothing else is. */
function checkWords(page: PageSnapshot, pdf: PdfFacts): PdfProblem[] {
  const expected = count(page.blocks.flatMap(words));
  const found = count(pdfWords(pdf.text, expected));
  const missing = difference(expected, found);
  const extra = difference(found, expected);
  const problems: PdfProblem[] = [];
  if (missing.length > 0) problems.push({ code: 'words-missing', words: missing });
  if (extra.length > 0) problems.push({ code: 'words-extra', words: extra });
  return problems;
}

/**
 * Each block comes out of the PDF in one piece, and the blocks come in page order: a two-column layout must
 * not be read across the columns. Compared without whitespace, so line breaks inside a block do not matter.
 */
function checkBlocks(page: PageSnapshot, pdf: PdfFacts): PdfProblem[] {
  const text = squeeze(pdf.text);
  const problems: PdfProblem[] = [];
  let cursor = 0;
  for (const block of page.blocks) {
    const wanted = squeeze(block);
    const at = text.indexOf(wanted, cursor);
    if (at !== -1) cursor = at + wanted.length;
    else problems.push({ code: text.includes(wanted) ? 'block-out-of-order' : 'block-split', block });
  }
  return problems;
}

function checkLinks(page: PageSnapshot, pdf: PdfFacts): PdfProblem[] {
  const clickable = new Set(pdf.links);
  return page.links
    .filter((link) => !clickable.has(link.href))
    .map((link) => ({ code: 'link-not-clickable', text: link.text, href: link.href }) as const);
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
