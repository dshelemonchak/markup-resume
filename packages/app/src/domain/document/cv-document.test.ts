import { describe, expect, it } from 'vitest';
import { checkCvDocument } from './cv-document.ts';

const VALID = `<!doctype html>
<html>
  <head><meta name="cv:title" content="Frontend"></head>
  <body></body>
</html>
`;

describe('checkCvDocument', () => {
  it('accepts a whole document with a title, regardless of case and surrounding whitespace', () => {
    expect(checkCvDocument(VALID)).toEqual([]);
    expect(checkCvDocument(`\n  <!DOCTYPE HTML><HTML><meta name="cv:title" content="X"></HTML>  `)).toEqual(
      [],
    );
  });

  it('reports a document that was cut off', () => {
    const truncated = VALID.slice(0, VALID.indexOf('<body>'));
    expect(checkCvDocument(truncated)).toEqual([
      'The document must end with </html>; it may have been cut off.',
    ]);
  });

  it('reports every problem at once', () => {
    expect(checkCvDocument('<p>just a fragment</p>')).toHaveLength(3);
  });

  it('reports a missing or empty title', () => {
    const untitled = VALID.replace('content="Frontend"', 'content=""');
    expect(checkCvDocument(untitled)).toEqual([
      'The document must keep <meta name="cv:title" content="…"> with a non-empty title.',
    ]);
  });
});
