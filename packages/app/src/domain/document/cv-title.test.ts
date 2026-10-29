import { describe, expect, it } from 'vitest';
import { readCvTitle } from './cv-title.ts';

describe('readCvTitle', () => {
  it('reads cv:title regardless of attribute order and quotes', () => {
    expect(readCvTitle('<meta name="cv:title" content="Senior Angular">')).toBe('Senior Angular');
    expect(readCvTitle("<META content='Full-Stack' NAME='cv:title' />")).toBe('Full-Stack');
  });

  it('decodes basic entities', () => {
    expect(readCvTitle('<meta name="cv:title" content="Java &amp; Angular">')).toBe('Java & Angular');
  });

  it('ignores other meta tags and returns null when absent or empty', () => {
    expect(readCvTitle('<meta name="author" content="Alex"><title>Page</title>')).toBeNull();
    expect(readCvTitle('<meta name="cv:title" content="  ">')).toBeNull();
  });
});
