import { readCvMeta } from './cv-meta.ts';

/** Reads the display title from <meta name="cv:title" content="…"> (ADR-0017); null when absent or empty. */
export function readCvTitle(html: string): string | null {
  return readCvMeta(html, 'cv:title');
}
