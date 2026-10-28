import { pageCount, primaryFontFamily } from './document-info';

describe('pageCount', () => {
  it('counts started pages, at least one', () => {
    expect(pageCount(0, 1123)).toBe(1);
    expect(pageCount(1123, 1123)).toBe(1);
    expect(pageCount(1124, 1123)).toBe(1); // sub-pixel rounding, not a new page
    expect(pageCount(1200, 1123)).toBe(2);
  });
});

describe('primaryFontFamily', () => {
  it('takes the first family without quotes', () => {
    expect(primaryFontFamily('"Source Sans 3", Arial, sans-serif')).toBe('Source Sans 3');
    expect(primaryFontFamily("'Inter'")).toBe('Inter');
    expect(primaryFontFamily('Georgia, serif')).toBe('Georgia');
  });

  it('returns null for an empty value', () => {
    expect(primaryFontFamily('')).toBeNull();
  });
});
