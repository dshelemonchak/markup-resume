import { describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, PdfFacts } from '../../domain/index.ts';
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

function dependencies(text: string) {
  const rendered: string[] = [];
  const facts: PdfFacts = { fonts: [], text, links: [] };
  return {
    rendered,
    dependencies: {
      repository,
      renderPdf: (slug: string) => {
        rendered.push(slug);
        return Promise.resolve({
          pdf: new Uint8Array([1, 2, 3]),
          page: { title: 'Alex – CV', blocks: ['Hello world'], links: [] },
        });
      },
      inspectPdf: () => Promise.resolve(facts),
    },
  };
}

describe('exportResumePdf', () => {
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
