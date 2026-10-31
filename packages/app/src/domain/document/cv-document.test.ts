import { describe, expect, it } from 'vitest';
import { checkCvDocument } from './cv-document.ts';

const VALID = `<!doctype html>
<html>
  <head><meta name="cv:title" content="Frontend"><meta name="cv:template" content="classic@0.0.2"></head>
  <body></body>
</html>
`;

describe('checkCvDocument', () => {
  it('accepts a whole document with a title, regardless of case and surrounding whitespace', () => {
    expect(checkCvDocument(VALID)).toEqual([]);
    expect(
      checkCvDocument(
        `\n  <!DOCTYPE HTML><HTML><meta name="cv:title" content="X"><meta name="cv:template" content="t@1"></HTML>  `,
      ),
    ).toEqual([]);
  });

  it('reports a document that was cut off', () => {
    const truncated = VALID.slice(0, VALID.indexOf('<body>'));
    expect(checkCvDocument(truncated)).toEqual([
      'The document must end with </html>; it may have been cut off.',
    ]);
  });

  it('reports every problem at once', () => {
    expect(checkCvDocument('<p>just a fragment</p>')).toHaveLength(4);
  });

  it('wants the template named', () => {
    const untemplated = VALID.replace('<meta name="cv:template" content="classic@0.0.2">', '');
    expect(checkCvDocument(untemplated)).toEqual([
      'The document must name its template in <meta name="cv:template" content="…">.',
    ]);
  });

  it('reports a missing or empty title', () => {
    const untitled = VALID.replace('content="Frontend"', 'content=""');
    expect(checkCvDocument(untitled)).toEqual([
      'The document must keep <meta name="cv:title" content="…"> with a non-empty title.',
    ]);
  });
});
