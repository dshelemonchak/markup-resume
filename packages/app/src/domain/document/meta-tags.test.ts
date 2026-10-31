import { describe, expect, it } from 'vitest';
import { readMetaTag } from './meta-tags.ts';

describe('readMetaTag', () => {
  it('reads the named meta tag, whatever the attribute order and quotes', () => {
    const html = `<meta name="resume:title" content="Title"><META content='classic@1' NAME='resume:template' />`;
    expect(readMetaTag(html, 'resume:template')).toBe('classic@1');
    expect(readMetaTag(html, 'resume:title')).toBe('Title');
  });

  it('returns null for an absent or empty tag', () => {
    expect(readMetaTag('<meta name="author" content="Alex">', 'resume:template')).toBeNull();
    expect(readMetaTag('<meta name="resume:template" content=" ">', 'resume:template')).toBeNull();
  });
});
