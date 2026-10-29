import { describe, expect, it } from 'vitest';
import type { CvRepository, PdfFacts } from '../../domain/index.ts';
import { exportCvPdf, pdfFileName } from './export-pdf.ts';

const repository: CvRepository = {
  list: () => Promise.resolve([]),
  getDocument: (id) => Promise.resolve(id === 'sample' ? '<html></html>' : null),
  save: () => Promise.resolve(),
  create: () => Promise.resolve(true),
  watch: () => () => {},
};

function services(text: string) {
  const rendered: string[] = [];
  const facts: PdfFacts = { fonts: [], text, links: [] };
  return {
    rendered,
    services: {
      repository,
      renderCv: (id: string) => {
        rendered.push(id);
        return Promise.resolve({
          pdf: new Uint8Array([1, 2, 3]),
          page: { title: 'Alex – CV', blocks: ['Hello world'], links: [] },
        });
      },
      inspectPdf: () => Promise.resolve(facts),
    },
  };
}

describe('exportCvPdf', () => {
  it('returns the PDF, named after the title, with what the check found', async () => {
    expect(await exportCvPdf(services('Hello world').services, 'sample')).toEqual({
      kind: 'exported',
      pdf: new Uint8Array([1, 2, 3]),
      fileName: 'Alex – CV.pdf',
      problems: [],
    });
    const result = await exportCvPdf(services('Hello').services, 'sample');
    expect(
      result.kind === 'exported' &&
        result.problems.some(
          (problem) => problem.code === 'words-missing' && problem.words.includes('world'),
        ),
    ).toBe(true);
  });

  it('renders nothing for an invalid id or a missing CV', async () => {
    const { services: deps, rendered } = services('');
    expect(await exportCvPdf(deps, '../x')).toEqual({ kind: 'invalid-id' });
    expect(await exportCvPdf(deps, 'missing')).toEqual({ kind: 'not-found' });
    expect(rendered).toEqual([]);
  });
});

describe('pdfFileName', () => {
  it('keeps the title, without what file systems refuse, and falls back to the id', () => {
    expect(pdfFileName('Alex: CV / 2026?', 'x')).toBe('Alex CV 2026.pdf');
    expect(pdfFileName('  ', 'sample')).toBe('sample.pdf');
  });
});
