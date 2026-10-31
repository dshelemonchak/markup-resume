import { describe, expect, it } from 'vitest';
import { parseMarkup } from './parse-markup.ts';

describe('parseMarkup', () => {
  it('returns the element tree with attributes, without text or comments', () => {
    const html = parseMarkup(
      '<!doctype html><title>T</title><main class="cv-page"><!-- note --><p>Hi <a href="https://x">x</a></p></main>',
    ).tree;
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
    const main = parseMarkup('<main><p>text<div class="cv-x"></div></main>').tree.children[1]!.children[0]!;
    expect(main.children.map((child) => child.tag)).toEqual(['p', 'div']);
  });

  it('serializes the same parse back as canonical HTML, which the browser would build the same tree from', () => {
    const { html } = parseMarkup('<!doctype html><SECTION CLASS=x><p>One<p>Two<div>Block</div></SECTION>');
    expect(html).toBe(
      '<!DOCTYPE html><html><head></head><body><section class="x"><p>One</p><p>Two</p><div>Block</div></section></body></html>',
    );
  });

  it('gives canonical HTML that does not change when parsed again', () => {
    const { html } = parseMarkup(
      '<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8" /></head>\n  <body><p>A&mdash;B</p></body>\n</html>\n',
    );
    expect(parseMarkup(html).html).toBe(html);
  });
});
