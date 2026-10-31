import { describe, expect, it } from 'vitest';
import { isValidResumeSlug } from './resume.ts';

describe('isValidResumeSlug', () => {
  it('accepts lower-case words joined by single hyphens', () => {
    expect(isValidResumeSlug('senior-angular')).toBe(true);
    expect(isValidResumeSlug('cv2026')).toBe(true);
  });

  it('rejects anything that could escape the CV folder or is malformed', () => {
    for (const slug of ['', '../etc', 'a/b', '.hidden', 'Upper', 'double--hyphen', '-start', 'end-', 'a b']) {
      expect(isValidResumeSlug(slug), slug).toBe(false);
    }
  });
});
