import { describe, expect, it } from 'vitest';
import { readResumeTitle } from './resume-title.ts';

describe('readResumeTitle', () => {
  it('reads resume:title regardless of attribute order and quotes', () => {
    expect(readResumeTitle('<meta name="resume:title" content="Senior Angular">')).toBe('Senior Angular');
    expect(readResumeTitle("<META content='Full-Stack' NAME='resume:title' />")).toBe('Full-Stack');
  });

  it('decodes basic entities', () => {
    expect(readResumeTitle('<meta name="resume:title" content="Java &amp; Angular">')).toBe('Java & Angular');
  });

  it('ignores other meta tags and returns null when absent or empty', () => {
    expect(readResumeTitle('<meta name="author" content="Alex"><title>Page</title>')).toBeNull();
    expect(readResumeTitle('<meta name="resume:title" content="  ">')).toBeNull();
  });
});
