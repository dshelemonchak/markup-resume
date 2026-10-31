import { type CvId, isValidCvId } from './cv.ts';

/** A CV, or one revision of it: "senior-angular" or "senior-angular@13" (ADR-0025). */
export interface CvAddress {
  readonly slug: CvId;
  /** The revision; the current one when left out. */
  readonly number?: number;
}

const ADDRESS = /^([^@]+)(?:@([1-9][0-9]*))?$/;

/** The slug and revision of an address, or null when it is not a valid one. */
export function parseCvAddress(value: string): CvAddress | null {
  const match = ADDRESS.exec(value);
  const slug = match?.[1];
  if (!match || slug === undefined || !isValidCvId(slug)) {
    return null;
  }
  const number = match[2];
  return number === undefined ? { slug } : { slug, number: Number(number) };
}

/** "senior-angular@13". */
export function formatCvAddress(slug: CvId, number: number): string {
  return `${slug}@${number}`;
}
