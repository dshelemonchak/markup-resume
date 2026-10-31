import { type ResumeSlug, isValidResumeSlug } from './resume.ts';

/** A CV, or one revision of it: "senior-angular" or "senior-angular@13" (ADR-0025). */
export interface ResumeAddress {
  readonly slug: ResumeSlug;
  /** The revision; the current one when left out. */
  readonly number?: number;
}

const ADDRESS = /^([^@]+)(?:@([1-9][0-9]*))?$/;

/** The slug and revision of an address, or null when it is not a valid one. */
export function parseResumeAddress(value: string): ResumeAddress | null {
  const match = ADDRESS.exec(value);
  const slug = match?.[1];
  if (!match || slug === undefined || !isValidResumeSlug(slug)) {
    return null;
  }
  const number = match[2];
  return number === undefined ? { slug } : { slug, number: Number(number) };
}

/** "senior-angular@13". */
export function formatResumeAddress(slug: ResumeSlug, number: number): string {
  return `${slug}@${number}`;
}
