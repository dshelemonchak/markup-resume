import { Directive, computed, input } from '@angular/core';

const DEFAULT_TEXT = 'dummy';
/** Small monospace text, so its width is known without measuring: 0.6em per character. */
const FONT_SIZE_PX = 10;
const CHAR_WIDTH_PX = FONT_SIZE_PX * 0.6;
/** Space between repetitions, both ways. */
const GAP_PX = 16; // 1rem
const COLOR = 'rgb(220 53 69 / 0.38)'; // Bootstrap danger, muted

const patterns = new Map<string, string>();

/**
 * The repeated word as an SVG pattern rotated by 45°, for the CSS background of the overlay.
 * The SVG has no size of its own, so as a background it fills the element without scaling.
 */
export function dummyPattern(text: string): string {
  let pattern = patterns.get(text);
  if (!pattern) {
    const width = Math.ceil(text.length * CHAR_WIDTH_PX) + GAP_PX;
    const height = FONT_SIZE_PX + GAP_PX;
    const escaped = text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="p" width="${width}" height="${height}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">` +
      `<text x="0" y="${FONT_SIZE_PX}" font-family="ui-monospace, Menlo, monospace" font-size="${FONT_SIZE_PX}" fill="${COLOR}">${escaped}</text>` +
      `</pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
    pattern = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    patterns.set(text, pattern);
  }
  return pattern;
}

/**
 * Marks a part of the UI that is not real yet (a placeholder): the word "dummy", or the given one,
 * repeated across it at 45°, faint red, every 1rem. Decorative only: the overlay ignores the pointer
 * and is not announced. The overlay is a ::after (see styles/_dummy.scss), so on an <input> or
 * <select>, which have none, put the directive on the wrapper.
 *
 *   <button mrDummy>Export PDF</button>
 *   <div mrDummy="soon">…</div>
 */
@Directive({
  selector: '[mrDummy]',
  host: {
    class: 'mr-dummy',
    '[style.--mr-dummy-pattern]': 'pattern()',
  },
})
export class DummyMark {
  readonly text = input('', { alias: 'mrDummy' });

  protected readonly pattern = computed(() => dummyPattern(this.text() || DEFAULT_TEXT));
}
