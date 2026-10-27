const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/**
 * Reads the display title from <meta name="cv:title" content="…"> (ADR-0017).
 * Attribute order and quote style do not matter. Returns null when the tag is absent or empty.
 */
export function readCvTitle(html: string): string | null {
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(ATTRIBUTE)) {
      attributes.set(match[1]!.toLowerCase(), match[3] ?? match[4] ?? '');
    }
    if (attributes.get('name') !== 'cv:title') continue;
    const title = decodeEntities(attributes.get('content') ?? '').trim();
    return title || null;
  }
  return null;
}

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name] ?? '');
}
