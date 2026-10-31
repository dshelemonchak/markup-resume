import { readMetaTag } from './meta-tags.ts';

/** Reads the display title from <meta name="resume:title" content="…"> (ADR-0017); null when absent or empty. */
export function readResumeTitle(html: string): string | null {
  return readMetaTag(html, 'resume:title');
}
