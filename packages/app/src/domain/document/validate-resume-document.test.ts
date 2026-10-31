import { describe, expect, it } from 'vitest';
import type { ResumeRepository } from '../resume/resume-repository.ts';
import type { MarkupElement, MarkupSchema, HtmlParser } from '../markup/markup.ts';
import type { TemplateCatalog } from '../template/template.ts';
import { validateResumeDocument } from './validate-resume-document.ts';

const schema: MarkupSchema = {
  plainElements: ['p'],
  classes: { 'resume-page': { tags: ['main'], parents: [] } },
};

const catalog: TemplateCatalog = {
  refs: () => ['classic@0.0.3'],
  styles: (ref) => (ref === 'classic@0.0.3' ? 'p {}' : null),
  guide: () => null,
  schema: (ref) => (ref === 'classic@0.0.3' ? schema : null),
};

const doc = (template = 'classic@0.0.3') =>
  `<!doctype html><html><head><meta name="resume:title" content="CV"><meta name="resume:template" content="${template}"></head><body><main class="resume-page"></main></body></html>`;

const element = (tag: string, attributes: Record<string, string> = {}, ...children: MarkupElement[]) => ({
  tag,
  attributes: new Map(Object.entries(attributes)),
  children,
});

/** A parser that records what it was given and answers with a fixed tree and a marked canonical form. */
function fakeParse(body: MarkupElement) {
  const calls: string[] = [];
  const parse: HtmlParser = (html) => {
    calls.push(html);
    return { tree: element('html', {}, element('head'), body), html: `canonical:${html.length}` };
  };
  return { parse, calls };
}

const page = element('body', {}, element('main', { class: 'resume-page' }));

describe('validateResumeDocument', () => {
  it('returns the canonical HTML of one parse of the styled document, and the template it names', () => {
    const { parse, calls } = fakeParse(page);
    const result = validateResumeDocument(doc(), catalog, parse);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('<style id="resume-lib" data-resume-lib="classic@0.0.3">');
    expect(result).toEqual({
      kind: 'valid',
      html: `canonical:${calls[0]!.length}`,
      template: { name: 'classic', version: '0.0.3' },
    });
  });

  it('checks the very tree it got from that parse', () => {
    const { parse } = fakeParse(
      element('body', {}, element('main', { class: 'resume-page', onclick: 'x()' })),
    );
    expect(validateResumeDocument(doc(), catalog, parse)).toEqual({
      kind: 'invalid',
      problems: [expect.stringContaining('onclick')],
    });
  });

  it('wants the template named, and known', () => {
    const { parse, calls } = fakeParse(page);
    const untemplated = doc().replace('<meta name="resume:template" content="classic@0.0.3">', '');
    expect(validateResumeDocument(untemplated, catalog, parse)).toEqual({
      kind: 'invalid',
      problems: ['The document must name its template in <meta name="resume:template" content="…">.'],
    });
    expect(validateResumeDocument(doc('modern@1'), catalog, parse)).toEqual({
      kind: 'invalid',
      problems: ['Unknown template "modern@1" in resume:template; use one of: "classic@0.0.3".'],
    });
    // Nothing to check the markup against, so nothing is parsed.
    expect(calls).toEqual([]);
  });

  it('reports every document problem at once', () => {
    const { parse } = fakeParse(page);
    const result = validateResumeDocument('<p>no document</p>', catalog, parse);
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.problems.length).toBeGreaterThan(1);
  });

  it('is the only source of HTML the storage port accepts', () => {
    const create: ResumeRepository['create'] = () => Promise.resolve('created');
    const resume = {
      slug: 'sample',
      title: 'CV',
      template: { name: 'classic', version: '0.0.3' },
      author: 'user',
    } as const;
    // @ts-expect-error A plain string is not CanonicalResumeHtml: unchecked HTML must not reach storage.
    void create({ ...resume, html: '<p>unchecked</p>' });

    const result = validateResumeDocument(doc(), catalog, fakeParse(page).parse);
    if (result.kind === 'valid') {
      void create({ ...resume, html: result.html });
    }
  });
});
