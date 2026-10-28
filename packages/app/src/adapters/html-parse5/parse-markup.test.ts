import { describe, expect, it } from 'vitest';
import { parseMarkup } from './parse-markup.ts';

describe('parseMarkup', () => {
  it('returns the element tree with attributes, without text or comments', () => {
    const html = parseMarkup(
      '<!doctype html><title>T</title><main class="cv-page"><!-- note --><p>Hi <a href="https://x">x</a></p></main>',
    );
    expect(html.tag).toBe('html');
    const body = html.children[1]!;
    expect(body.tag).toBe('body');
    const main = body.children[0]!;
    expect(main.attributes.get('class')).toBe('cv-page');
    expect(main.children.map((child) => child.tag)).toEqual(['p']);
    expect(main.children[0]!.children[0]!.attributes.get('href')).toBe('https://x');
  });

  it('builds the tree the way a browser does', () => {
    // A <div> cannot sit in a <p>: the browser closes the paragraph first, so the div becomes its sibling.
    const main = parseMarkup('<main><p>text<div class="cv-x"></div></main>').children[1]!.children[0]!;
    expect(main.children.map((child) => child.tag)).toEqual(['p', 'div']);
  });
});
