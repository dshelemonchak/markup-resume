import { describe, expect, it } from 'vitest';
import { checkPdf, type PageSnapshot, type PdfFacts } from './cv-pdf.ts';

const FONT = { name: 'Inter-Regular', type: 'CID TrueType', embedded: true, unicode: true };

const page: PageSnapshot = {
  title: 'CV',
  blocks: ['Alex Morgan', 'Contacts', 'alex@example.com', 'Experience', 'Built end-to-end features.'],
  links: [{ href: 'mailto:alex@example.com', text: 'alex@example.com' }],
};

const pdf = (text: string, overrides: Partial<PdfFacts> = {}): PdfFacts => ({
  fonts: [FONT],
  text,
  links: ['mailto:alex@example.com'],
  ...overrides,
});

describe('checkPdf', () => {
  it('passes a PDF whose text reads like the page, line breaks and a broken hyphenated word included', () => {
    const text = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-\nto-end features.\n';
    expect(checkPdf(page, pdf(text))).toEqual([]);
  });

  it('treats dashes, quotes and spaces the PDF writes differently as the same text', () => {
    const typographic = { ...page, blocks: ['2020 – 2022', 'Alex’s CV'], links: [] };
    expect(checkPdf(typographic, pdf("2020 - 2022\nAlex's CV", { links: [] }))).toEqual([]);
  });

  it('finds words split by letter spacing', () => {
    const text = 'A l e x Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(text))).toEqual([
      'Words of the page that the PDF text does not have: "Alex".',
      'Words in the PDF text that the page does not have: "A", "l", "e", "x".',
    ]);
  });

  it('finds columns read across: blocks out of order, and blocks cut into', () => {
    const across = 'Alex Morgan\nExperience\nContacts\nalex@example.com\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(across))).toEqual([
      '"Experience" comes earlier in the PDF text than on the page: the reading order is off.',
    ]);
    const cut = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end\nContacts\nfeatures.';
    expect(
      checkPdf({ ...page, blocks: page.blocks.slice(0, 4).concat('Built end-to-end features.') }, pdf(cut)),
    ).toContain(
      '"Built end-to-end features." does not come out of the PDF in one piece: other text cuts into it.',
    );
  });

  it('finds fonts that give no text back', () => {
    const fonts = [
      { ...FONT, name: 'Shapes', type: 'Type 3' },
      { ...FONT, name: 'Loose', embedded: false },
      { ...FONT, name: 'NoMap', unicode: false },
    ];
    const text = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(text, { fonts }))).toEqual([
      'The font Shapes is drawn as shapes (Type 3): its text cannot be copied or searched.',
      'The font Loose is not embedded: the PDF looks different elsewhere.',
      'The font NoMap has no Unicode map: its text copies as garbage.',
    ]);
  });

  it('finds links that do not click', () => {
    const text = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(text, { links: [] }))).toEqual([
      'The link "alex@example.com" (mailto:alex@example.com) cannot be clicked in the PDF.',
    ]);
  });
});
