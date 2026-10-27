import { describe, expect, it } from 'vitest';
import { isValidCvId } from './cv.ts';

describe('isValidCvId', () => {
  it('accepts lower-case words joined by single hyphens', () => {
    expect(isValidCvId('senior-angular')).toBe(true);
    expect(isValidCvId('cv2026')).toBe(true);
  });

  it('rejects anything that could escape the CV folder or is malformed', () => {
    for (const id of ['', '../etc', 'a/b', '.hidden', 'Upper', 'double--hyphen', '-start', 'end-', 'a b']) {
      expect(isValidCvId(id), id).toBe(false);
    }
  });
});
