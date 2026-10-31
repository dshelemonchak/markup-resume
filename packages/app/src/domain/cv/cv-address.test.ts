import { describe, expect, it } from 'vitest';
import { formatCvAddress, parseCvAddress } from './cv-address.ts';

describe('parseCvAddress', () => {
  it('reads a slug alone as the current revision, and slug@number as that revision', () => {
    expect(parseCvAddress('senior-angular')).toEqual({ slug: 'senior-angular' });
    expect(parseCvAddress('senior-angular@13')).toEqual({ slug: 'senior-angular', number: 13 });
  });

  it('rejects anything else', () => {
    for (const value of [
      '',
      '@1',
      'Senior',
      'senior@',
      'senior@0',
      'senior@01',
      'senior@-1',
      'senior@1.5',
      'a@1@2',
      '../x@1',
    ]) {
      expect(parseCvAddress(value), value).toBeNull();
    }
  });

  it('formats what it parses', () => {
    expect(formatCvAddress('senior-angular', 13)).toBe('senior-angular@13');
    expect(parseCvAddress(formatCvAddress('senior-angular', 13))).toEqual({
      slug: 'senior-angular',
      number: 13,
    });
  });
});
