import { describe, expect, it } from 'vitest';
import type { CvRepository, CvSummary, ParseMarkup, TemplateCatalog } from '../../domain/index.ts';
import { createCvDocument, getCvDocument, listCvs, MAX_CV_DOCUMENT_BYTES, saveCvDocument } from './cvs.ts';
import { CvChanges } from '../cv-changes/cv-changes.ts';

const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.2'],
  styles: (ref) => (ref === 'classic@0.0.2' ? 'p {}' : null),
  guide: () => null,
  schema: () => null,
};

// No template in these tests has a schema, so the tree is never looked at; the document comes back as it was.
const parseMarkup: ParseMarkup = (html) => ({
  tree: { tag: 'html', attributes: new Map(), children: [] },
  html,
});

/** A whole document naming a template; `stored` is the same after the template styles were put in. */
const doc = (title: string, template = 'classic@0.0.2') =>
  `<!doctype html><html><head><meta name="cv:title" content="${title}"><meta name="cv:template" content="${template}"></head><body></body></html>`;
const stored = (title: string) =>
  doc(title).replace(
    '</head>',
    '  <style id="cv-lib" data-cv-lib="classic@0.0.2">\np {}\n  </style>\n</head>',
  );

const services = (repository: CvRepository, cvChanges = new CvChanges()) => ({
  repository,
  templates,
  parseMarkup,
  cvChanges,
});

/** A CvChanges that records the ids it announces, as a subscriber would see them. */
function recordChanges() {
  const cvChanges = new CvChanges();
  const notified: string[] = [];
  cvChanges.onChange((id) => notified.push(id));
  return { cvChanges, notified };
}

function fakeRepository(cvs: CvSummary[], documents: Record<string, string> = {}): CvRepository {
  return {
    list: () => Promise.resolve(cvs),
    getDocument: (id) => Promise.resolve(documents[id] ?? null),
    save: () => Promise.resolve(),
    create: () => Promise.resolve(true),
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
  function setup() {
    const documents: Record<string, string> = { sample: stored('Old') };
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

  it('saves a valid document of an existing CV and announces the change', async () => {
    const { repository, documents, saves } = setup();
    const { cvChanges, notified } = recordChanges();
    expect(await saveCvDocument(services(repository, cvChanges), 'sample', doc('New'))).toEqual({
      kind: 'saved',
    });
    expect(saves).toEqual(['sample']);
    expect(documents['sample']).toBe(stored('New'));
    expect(notified).toEqual(['sample']);
  });

  it('does not write or announce a document identical to the stored one', async () => {
    const { repository, saves } = setup();
    const { cvChanges, notified } = recordChanges();
    expect(await saveCvDocument(services(repository, cvChanges), 'sample', doc('Old'))).toEqual({
      kind: 'unchanged',
    });
    expect(saves).toEqual([]);
    expect(notified).toEqual([]);
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
    expect(await saveCvDocument(services(repository), 'sample', doc('New'))).toEqual({ kind: 'saved' });
    expect(documents['sample']).toContain('<style id="cv-lib" data-cv-lib="classic@0.0.2">\np {}');
    // The stored document, sent back as it is, changes nothing.
    expect(await saveCvDocument(services(repository), 'sample', documents['sample']!)).toEqual({
      kind: 'unchanged',
    });
  });

  it('rejects a template that does not exist', async () => {
    const { repository, saves } = setup();
    expect(await saveCvDocument(services(repository), 'sample', doc('New', 'modern@1'))).toMatchObject({
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

  it('creates a CV under a free id and announces it', async () => {
    const { repository, created } = setup();
    const { cvChanges, notified } = recordChanges();
    expect(await createCvDocument(services(repository, cvChanges), 'fresh', doc('New'))).toEqual({
      kind: 'created',
    });
    expect(created).toEqual(['fresh']);
    expect(notified).toEqual(['fresh']);
  });

  it('reports an id that is already taken, announcing nothing', async () => {
    const { repository } = setup(['sample']);
    const { cvChanges, notified } = recordChanges();
    expect(await createCvDocument(services(repository, cvChanges), 'sample', doc('New'))).toEqual({
      kind: 'already-exists',
    });
    expect(notified).toEqual([]);
  });

  it('checks the id and the document before touching the repository', async () => {
    const { repository, created } = setup();
    expect(await createCvDocument(services(repository), '../secret', doc('New'))).toEqual({
      kind: 'invalid-id',
    });
    expect(
      await createCvDocument(services(repository), 'fresh', doc('New').replace('</html>', '')),
    ).toMatchObject({
      kind: 'invalid-document',
    });
    expect(created).toEqual([]);
  });
});
