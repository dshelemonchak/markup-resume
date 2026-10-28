import { describe, expect, it } from 'vitest';
import type { CvRepository, CvSummary, ParseMarkup, TemplateCatalog } from '../domain/index.ts';
import { createCvDocument, getCvDocument, listCvs, MAX_CV_DOCUMENT_BYTES, saveCvDocument } from './cvs.ts';

const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.2'],
  styles: (ref) => (ref === 'classic@0.0.2' ? 'p {}' : null),
  guide: () => null,
  schema: () => null,
};

// No template in these tests has a schema, so the parser is never asked.
const parseMarkup: ParseMarkup = () => {
  throw new Error('not expected to parse');
};

const services = (repository: CvRepository) => ({ repository, templates, parseMarkup });

function fakeRepository(cvs: CvSummary[], documents: Record<string, string> = {}): CvRepository {
  return {
    list: () => Promise.resolve(cvs),
    getDocument: (id) => Promise.resolve(documents[id] ?? null),
    save: () => Promise.resolve(),
    create: () => Promise.resolve(true),
    watch: () => () => {},
  };
}

describe('listCvs', () => {
  it('returns the most recently changed CVs first', async () => {
    const repository = fakeRepository([
      { id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', title: 'New', updatedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect((await listCvs(repository)).map((cv) => cv.id)).toEqual(['new', 'old']);
  });
});

describe('getCvDocument', () => {
  const repository = fakeRepository([], { sample: '<html></html>' });

  it('returns the document when it exists', async () => {
    expect(await getCvDocument(repository, 'sample')).toEqual({ kind: 'found', html: '<html></html>' });
  });

  it('distinguishes an invalid id from a missing CV', async () => {
    expect(await getCvDocument(repository, '../secret')).toEqual({ kind: 'invalid-id' });
    expect(await getCvDocument(repository, 'missing')).toEqual({ kind: 'not-found' });
  });
});

describe('saveCvDocument', () => {
  const doc = (title: string) => `<!doctype html><html><meta name="cv:title" content="${title}"></html>`;

  function setup() {
    const documents: Record<string, string> = { sample: doc('Old') };
    const saves: string[] = [];
    const repository: CvRepository = {
      ...fakeRepository([], documents),
      save: (id, html) => {
        saves.push(id);
        documents[id] = html;
        return Promise.resolve();
      },
    };
    return { repository, documents, saves };
  }

  it('saves a valid document of an existing CV', async () => {
    const { repository, documents, saves } = setup();
    expect(await saveCvDocument(services(repository), 'sample', doc('New'))).toEqual({ kind: 'saved' });
    expect(saves).toEqual(['sample']);
    expect(documents['sample']).toBe(doc('New'));
  });

  it('does not write a document identical to the stored one', async () => {
    const { repository, saves } = setup();
    expect(await saveCvDocument(services(repository), 'sample', doc('Old'))).toEqual({ kind: 'unchanged' });
    expect(saves).toEqual([]);
  });

  it('rejects invalid ids and missing CVs without writing', async () => {
    const { repository, saves } = setup();
    expect(await saveCvDocument(services(repository), '../secret', doc('New'))).toEqual({
      kind: 'invalid-id',
    });
    expect(await saveCvDocument(services(repository), 'missing', doc('New'))).toEqual({ kind: 'not-found' });
    expect(saves).toEqual([]);
  });

  it('measures the size limit in UTF-8 bytes, not characters', async () => {
    const { repository, saves } = setup();
    // Two bytes per Cyrillic letter: under the limit in characters, over it in bytes.
    const filler = 'ж'.repeat(MAX_CV_DOCUMENT_BYTES / 2);
    const result = await saveCvDocument(services(repository), 'sample', doc(filler));
    expect(result).toMatchObject({ kind: 'too-large', limitBytes: MAX_CV_DOCUMENT_BYTES });
    expect(saves).toEqual([]);
  });

  it('stores the document with the styles of the template it names', async () => {
    const { repository, documents } = setup();
    const sent = doc('New').replace(
      '<meta',
      '<head><meta name="cv:template" content="classic@0.0.2"></head><meta',
    );
    expect(await saveCvDocument(services(repository), 'sample', sent)).toEqual({ kind: 'saved' });
    expect(documents['sample']).toContain('<style id="cv-lib" data-cv-lib="classic@0.0.2">\np {}');
    // The stored document, sent back as it is, changes nothing.
    expect(await saveCvDocument(services(repository), 'sample', documents['sample']!)).toEqual({
      kind: 'unchanged',
    });
  });

  it('rejects a template that does not exist', async () => {
    const { repository, saves } = setup();
    const sent = doc('New').replace(
      '<meta',
      '<head><meta name="cv:template" content="modern@1"></head><meta',
    );
    expect(await saveCvDocument(services(repository), 'sample', sent)).toMatchObject({
      kind: 'invalid-document',
      problems: [expect.stringContaining('Unknown template "modern@1"')],
    });
    expect(saves).toEqual([]);
  });

  it('returns the problems of a broken document', async () => {
    const { repository, saves } = setup();
    const result = await saveCvDocument(services(repository), 'sample', doc('New').replace('</html>', ''));
    expect(result).toEqual({
      kind: 'invalid-document',
      problems: ['The document must end with </html>; it may have been cut off.'],
    });
    expect(saves).toEqual([]);
  });
});

describe('createCvDocument', () => {
  const doc = '<!doctype html><html><meta name="cv:title" content="New"></html>';

  function setup(existing: string[] = []) {
    const created: string[] = [];
    const repository: CvRepository = {
      ...fakeRepository([]),
      create: (id) => {
        if (existing.includes(id)) return Promise.resolve(false);
        created.push(id);
        return Promise.resolve(true);
      },
    };
    return { repository, created };
  }

  it('creates a CV under a free id', async () => {
    const { repository, created } = setup();
    expect(await createCvDocument(services(repository), 'fresh', doc)).toEqual({ kind: 'created' });
    expect(created).toEqual(['fresh']);
  });

  it('reports an id that is already taken', async () => {
    const { repository } = setup(['sample']);
    expect(await createCvDocument(services(repository), 'sample', doc)).toEqual({ kind: 'already-exists' });
  });

  it('checks the id and the document before touching the repository', async () => {
    const { repository, created } = setup();
    expect(await createCvDocument(services(repository), '../secret', doc)).toEqual({ kind: 'invalid-id' });
    expect(await createCvDocument(services(repository), 'fresh', doc.replace('</html>', ''))).toMatchObject({
      kind: 'invalid-document',
    });
    expect(created).toEqual([]);
  });
});
