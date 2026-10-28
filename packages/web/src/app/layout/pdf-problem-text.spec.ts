import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { pdfProblemLines } from './pdf-problem-text';

/** The real English dictionary, as the app translates. */
const t = (key: string, params?: Record<string, unknown>) =>
  TestBed.inject(TranslocoService).translate(key, params);

describe('pdfProblemLines', () => {
  it('phrases every kind of problem from its code and details', () => {
    expect(
      pdfProblemLines(
        [
          { code: 'font-not-embedded', font: 'Loose' },
          { code: 'font-no-unicode', font: 'NoMap' },
          { code: 'words-missing', words: ['Canvas'] },
          { code: 'block-split', block: 'Built end-to-end features.' },
          { code: 'link-not-clickable', text: 'example.com', href: 'https://example.com' },
        ],
        t,
      ),
    ).toEqual([
      'The font Loose is not embedded: the PDF looks different elsewhere.',
      'The font NoMap has no Unicode map: its text copies as garbage.',
      'Words of the page that the PDF text does not have: "Canvas".',
      '"Built end-to-end features." does not come out of the PDF in one piece: other text cuts into it.',
      'The link "example.com" (https://example.com) cannot be clicked in the PDF.',
    ]);
  });

  it('shortens long lists: words, quoted blocks and the problems themselves', () => {
    const words = Array.from({ length: 12 }, (_, index) => `w${index}`);
    const [first] = pdfProblemLines([{ code: 'words-extra', words }], t);
    expect(first).toBe(
      'Words in the PDF text that the page does not have: "w0", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9" and 2 more.',
    );
    const [block] = pdfProblemLines([{ code: 'block-out-of-order', block: 'x'.repeat(80) }], t);
    expect(block).toContain(`"${'x'.repeat(57)}…"`);
    const many = Array.from({ length: 13 }, () => ({ code: 'font-type3' as const, font: 'F' }));
    expect(pdfProblemLines(many, t).at(-1)).toBe('…and 3 more problems.');
  });
});
