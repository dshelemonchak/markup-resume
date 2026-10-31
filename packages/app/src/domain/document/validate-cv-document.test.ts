import { describe, expect, it } from 'vitest';
import type { CvRepository } from '../cv/cv-repository.ts';
import type { MarkupElement, MarkupSchema, ParseMarkup } from '../markup/cv-markup.ts';
import type { TemplateCatalog } from '../template/cv-template.ts';
import { validateCvDocument } from './validate-cv-document.ts';

const schema: MarkupSchema = {
  plainElements: ['p'],
  classes: { 'cv-page': { tags: ['main'], parents: [] } },
};

const catalog: TemplateCatalog = {
  refs: () => ['classic@0.0.2'],
  styles: (ref) => (ref === 'classic@0.0.2' ? 'p {}' : null),
  guide: () => null,
  schema: (ref) => (ref === 'classic@0.0.2' ? schema : null),
};

const doc = (template = 'classic@0.0.2') =>
  `<!doctype html><html><head><meta name="cv:title" content="CV"><meta name="cv:template" content="${template}"></head><body><main class="cv-page"></main></body></html>`;

const element = (tag: string, attributes: Record<string, string> = {}, ...children: MarkupElement[]) => ({
  tag,
  attributes: new Map(Object.entries(attributes)),
  children,
});

/** A parser that records what it was given and answers with a fixed tree and a marked canonical form. */
function fakeParse(body: MarkupElement) {
  const calls: string[] = [];
  const parse: ParseMarkup = (html) => {
    calls.push(html);
    return { tree: element('html', {}, element('head'), body), html: `canonical:${html.length}` };
  };
  return { parse, calls };
}

const page = element('body', {}, element('main', { class: 'cv-page' }));

describe('validateCvDocument', () => {
  it('returns the canonical HTML of one parse of the styled document, and the template it names', () => {
    const { parse, calls } = fakeParse(page);
    const result = validateCvDocument(doc(), catalog, parse);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('<style id="cv-lib" data-cv-lib="classic@0.0.2">');
    expect(result).toEqual({
      kind: 'valid',
      html: `canonical:${calls[0]!.length}`,
      template: { name: 'classic', version: '0.0.2' },
    });
  });

  it('checks the very tree it got from that parse', () => {
    const { parse } = fakeParse(element('body', {}, element('main', { class: 'cv-page', onclick: 'x()' })));
    expect(validateCvDocument(doc(), catalog, parse)).toEqual({
      kind: 'invalid',
      problems: [expect.stringContaining('onclick')],
    });
  });

  it('wants the template named, and known', () => {
    const { parse, calls } = fakeParse(page);
    const untemplated = doc().replace('<meta name="cv:template" content="classic@0.0.2">', '');
    expect(validateCvDocument(untemplated, catalog, parse)).toEqual({
      kind: 'invalid',
      problems: ['The document must name its template in <meta name="cv:template" content="…">.'],
    });
    expect(validateCvDocument(doc('modern@1'), catalog, parse)).toEqual({
      kind: 'invalid',
      problems: ['Unknown template "modern@1" in cv:template; use one of: "classic@0.0.2".'],
    });
    // Nothing to check the markup against, so nothing is parsed.
    expect(calls).toEqual([]);
  });

  it('reports every document problem at once', () => {
    const { parse } = fakeParse(page);
    const result = validateCvDocument('<p>no document</p>', catalog, parse);
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.problems.length).toBeGreaterThan(1);
  });

  it('is the only source of HTML the storage port accepts', () => {
    const save: CvRepository['save'] = () => Promise.resolve();
    // @ts-expect-error A plain string is not CanonicalCvHtml: unchecked HTML must not reach storage.
    void save('sample', '<p>unchecked</p>');

    const result = validateCvDocument(doc(), catalog, fakeParse(page).parse);
    if (result.kind === 'valid') {
      void save('sample', result.html);
    }
  });
});
