import { describe, expect, it } from 'vitest';
import { readCvMeta } from './cv-meta.ts';

describe('readCvMeta', () => {
  it('reads the named meta tag, whatever the attribute order and quotes', () => {
    const html = `<meta name="cv:title" content="Title"><META content='classic@1' NAME='cv:template' />`;
    expect(readCvMeta(html, 'cv:template')).toBe('classic@1');
    expect(readCvMeta(html, 'cv:title')).toBe('Title');
  });

  it('returns null for an absent or empty tag', () => {
    expect(readCvMeta('<meta name="author" content="Alex">', 'cv:template')).toBeNull();
    expect(readCvMeta('<meta name="cv:template" content=" ">', 'cv:template')).toBeNull();
  });
});
