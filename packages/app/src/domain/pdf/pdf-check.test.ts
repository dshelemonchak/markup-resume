import { describe, expect, it } from 'vitest';
import { checkPdf, type PageSnapshot, type PdfFacts } from './pdf-check.ts';

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
      { code: 'words-missing', words: ['Alex'] },
      { code: 'words-extra', words: ['A', 'l', 'e', 'x'] },
    ]);
  });

  it('finds columns read across: blocks out of order, and blocks cut into', () => {
    const across = 'Alex Morgan\nExperience\nContacts\nalex@example.com\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(across))).toEqual([{ code: 'block-out-of-order', block: 'Experience' }]);
    const cut = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end\nContacts\nfeatures.';
    expect(
      checkPdf({ ...page, blocks: page.blocks.slice(0, 4).concat('Built end-to-end features.') }, pdf(cut)),
    ).toContainEqual({ code: 'block-split', block: 'Built end-to-end features.' });
  });

  it('finds fonts that give no text back', () => {
    const fonts = [
      { ...FONT, name: 'Shapes', type: 'Type 3' },
      { ...FONT, name: 'Loose', embedded: false },
      { ...FONT, name: 'NoMap', unicode: false },
    ];
    const text = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(text, { fonts }))).toEqual([
      { code: 'font-type3', font: 'Shapes' },
      { code: 'font-not-embedded', font: 'Loose' },
      { code: 'font-no-unicode', font: 'NoMap' },
    ]);
  });

  it('finds links that do not click', () => {
    const text = 'Alex Morgan\nContacts\nalex@example.com\nExperience\nBuilt end-to-end features.';
    expect(checkPdf(page, pdf(text, { links: [] }))).toEqual([
      { code: 'link-not-clickable', text: 'alex@example.com', href: 'mailto:alex@example.com' },
    ]);
  });
});
