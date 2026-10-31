import { describe, expect, it } from 'vitest';
import { checkDocumentBasics } from './document-basics.ts';

const VALID = `<!doctype html>
<html>
  <head><meta name="resume:title" content="Frontend"><meta name="resume:template" content="classic@0.0.3"></head>
  <body></body>
</html>
`;

describe('checkDocumentBasics', () => {
  it('accepts a whole document with a title, regardless of case and surrounding whitespace', () => {
    expect(checkDocumentBasics(VALID)).toEqual([]);
    expect(
      checkDocumentBasics(
        `\n  <!DOCTYPE HTML><HTML><meta name="resume:title" content="X"><meta name="resume:template" content="t@1"></HTML>  `,
      ),
    ).toEqual([]);
  });

  it('reports a document that was cut off', () => {
    const truncated = VALID.slice(0, VALID.indexOf('<body>'));
    expect(checkDocumentBasics(truncated)).toEqual([
      'The document must end with </html>; it may have been cut off.',
    ]);
  });

  it('reports every problem at once', () => {
    expect(checkDocumentBasics('<p>just a fragment</p>')).toHaveLength(4);
  });

  it('wants the template named', () => {
    const untemplated = VALID.replace('<meta name="resume:template" content="classic@0.0.3">', '');
    expect(checkDocumentBasics(untemplated)).toEqual([
      'The document must name its template in <meta name="resume:template" content="…">.',
    ]);
  });

  it('reports a missing or empty title', () => {
    const untitled = VALID.replace('content="Frontend"', 'content=""');
    expect(checkDocumentBasics(untitled)).toEqual([
      'The document must keep <meta name="resume:title" content="…"> with a non-empty title.',
    ]);
  });
});
