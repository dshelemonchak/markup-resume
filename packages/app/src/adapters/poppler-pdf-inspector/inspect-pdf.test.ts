import { describe, expect, it } from 'vitest';
import { parseFonts, parseLinks } from './inspect-pdf.ts';

describe('parseFonts', () => {
  it('reads pdffonts output, with types that contain spaces', () => {
    const output = [
      'name                                 type              encoding         emb sub uni object ID',
      '------------------------------------ ----------------- ---------------- --- --- --- ---------',
      'AAAAAA+Inter-Bold                    CID TrueType      Identity-H       yes yes yes      4  0',
      '[none]                               Type 3            Custom           yes no  no       9  0',
      '',
    ].join('\n');
    expect(parseFonts(output)).toEqual([
      { name: 'AAAAAA+Inter-Bold', type: 'CID TrueType', embedded: true, unicode: true },
      { name: '[none]', type: 'Type 3', embedded: true, unicode: false },
    ]);
  });
});

describe('parseLinks', () => {
  it('reads link targets from pdftohtml -xml, decoding entities', () => {
    const xml =
      '<text top="1" left="1" width="1" height="1" font="3"><a href="mailto:a@example.com">a@example.com</a></text>\n' +
      '<text top="2" left="1" width="1" height="1" font="3"><a href="https://x.com/?a=1&amp;b=2">x</a></text>';
    expect(parseLinks(xml)).toEqual(['mailto:a@example.com', 'https://x.com/?a=1&b=2']);
  });
});
