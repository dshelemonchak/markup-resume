import { describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, PdfFacts, TemplateCatalog } from '../../domain/index.ts';
import { InMemoryResumeRepository } from '../testing/in-memory-resume-repository.ts';
import { exportResumePdf, pdfFileName } from './export-pdf.ts';

const repository = new InMemoryResumeRepository();
await repository.create({
  slug: 'sample',
  title: 'Sample',
  html: '<html></html>' as CanonicalResumeHtml,
  template: { name: 'classic', version: '0.0.3' },
  author: 'system',
});
await repository.create({
  slug: 'on-template',
  title: 'On a template',
  html: '<html><head><meta name="resume:template" content="classic@0.0.3"></head><body></body></html>' as CanonicalResumeHtml,
  template: { name: 'classic', version: '0.0.3' },
  author: 'system',
});

/** "classic@0.0.3" has both versions; "plain@0.0.1" has no ATS version. */
const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.3', 'plain@0.0.1'],
  styles: (ref, variant = 'visual') => {
    if (ref === 'classic@0.0.3') {
      return variant === 'ats' ? '.visual {} .ats {}' : '.visual {}';
    }
    return ref === 'plain@0.0.1' && variant === 'visual' ? '.plain {}' : null;
  },
  guide: () => null,
  schema: () => null,
};

function dependencies(text: string) {
  const rendered: string[] = [];
  const facts: PdfFacts = { fonts: [], text, links: [] };
  return {
    rendered,
    dependencies: {
      repository,
      renderPdf: (html: string) => {
        rendered.push(html);
        return Promise.resolve({
          pdf: new Uint8Array([1, 2, 3]),
          page: { title: 'Alex – CV', blocks: ['Hello world'], links: [] },
        });
      },
      inspectPdf: () => Promise.resolve(facts),
      templates,
    },
  };
}

describe('exportResumePdf', () => {
  it('prints the document as stored by default, and with the ATS styles for the ATS version', async () => {
    const { dependencies: deps, rendered } = dependencies('Hello world');
    await exportResumePdf(deps, 'on-template');
    await exportResumePdf(deps, 'on-template', 'ats');
    // The visual version is the document as stored, styled when it was saved.
    expect(rendered[0]).not.toContain('.ats {}');
    expect(rendered[1]).toContain('.ats {}');
  });

  it('says so when the template has no ATS version', async () => {
    await repository.create({
      slug: 'plain',
      title: 'Plain',
      html: '<html><head><meta name="resume:template" content="plain@0.0.1"></head><body></body></html>' as CanonicalResumeHtml,
      template: { name: 'plain', version: '0.0.1' },
      author: 'system',
    });
    const { dependencies: deps, rendered } = dependencies('');
    expect(await exportResumePdf(deps, 'plain', 'ats')).toMatchObject({ kind: 'no-variant' });
    expect(rendered).toEqual([]);
  });

  it('returns the PDF, named after the title, with what the check found', async () => {
    expect(await exportResumePdf(dependencies('Hello world').dependencies, 'sample')).toEqual({
      kind: 'exported',
      pdf: new Uint8Array([1, 2, 3]),
      fileName: 'Alex – CV.pdf',
      problems: [],
    });
    const result = await exportResumePdf(dependencies('Hello').dependencies, 'sample');
    expect(
      result.kind === 'exported' &&
        result.problems.some(
          (problem) => problem.code === 'words-missing' && problem.words.includes('world'),
        ),
    ).toBe(true);
  });

  it('renders nothing for an invalid slug or a missing CV', async () => {
    const { dependencies: deps, rendered } = dependencies('');
    expect(await exportResumePdf(deps, '../x')).toEqual({ kind: 'invalid-slug' });
    expect(await exportResumePdf(deps, 'missing')).toEqual({ kind: 'not-found' });
    expect(rendered).toEqual([]);
  });
});

describe('pdfFileName', () => {
  it('keeps the title, without what file systems refuse, and falls back to the id', () => {
    expect(pdfFileName('Alex: CV / 2026?', 'x')).toBe('Alex CV 2026.pdf');
    expect(pdfFileName('  ', 'sample')).toBe('sample.pdf');
  });
});
