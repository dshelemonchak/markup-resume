import { beforeEach, describe, expect, it } from 'vitest';
import type { ParseMarkup, TemplateCatalog } from '../../domain/index.ts';
import { CvChanges } from '../cv-changes/cv-changes.ts';
import { MemoryCvStore } from '../testing/memory-cv-store.ts';
import { createCvDocument, getCvDocument, listCvs, MAX_CV_DOCUMENT_BYTES, saveCvDocument } from './cvs.ts';

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

let store: MemoryCvStore;
let cvChanges: CvChanges;
let notified: string[];

const services = () => ({ store, templates, parseMarkup, cvChanges });

beforeEach(() => {
  store = new MemoryCvStore();
  cvChanges = new CvChanges();
  notified = [];
  cvChanges.onChange((id) => notified.push(id));
});

/** A CV "sample" at revision 1, created before the test starts listening. */
async function withSample(title = 'Old') {
  await createCvDocument(services(), 'sample', doc(title), 'system');
  notified.length = 0;
}

describe('listCvs', () => {
  it('lists the CVs by slug, most recently changed first', async () => {
    await createCvDocument(services(), 'older', doc('Older'), 'system');
    await createCvDocument(services(), 'newer', doc('Newer'), 'system');
    expect(await listCvs(store)).toEqual([
      expect.objectContaining({ id: 'newer', title: 'Newer' }),
      expect.objectContaining({ id: 'older', title: 'Older' }),
    ]);
  });
});

describe('getCvDocument', () => {
  it('returns the current document', async () => {
    await withSample();
    expect(await getCvDocument(store, 'sample')).toEqual({
      kind: 'found',
      slug: 'sample',
      html: stored('Old'),
      number: 1,
      current: 1,
    });
  });

  it('returns an earlier revision by its address', async () => {
    await withSample();
    await saveCvDocument(services(), 'sample', doc('New'), 'claude');
    expect(await getCvDocument(store, 'sample@1')).toMatchObject({
      number: 1,
      current: 2,
      html: stored('Old'),
    });
    expect(await getCvDocument(store, 'sample@9')).toEqual({ kind: 'not-found' });
    expect(await getCvDocument(store, 'sample@0')).toEqual({ kind: 'invalid-id' });
  });

  it('distinguishes an invalid id from a missing CV', async () => {
    expect(await getCvDocument(store, '../secret')).toEqual({ kind: 'invalid-id' });
    expect(await getCvDocument(store, 'missing')).toEqual({ kind: 'not-found' });
  });
});

describe('saveCvDocument', () => {
  it('writes the next revision by its author, takes the title from it and announces the change', async () => {
    await withSample();
    expect(await saveCvDocument(services(), 'sample', doc('New'), 'claude')).toEqual({
      kind: 'saved',
      slug: 'sample',
      number: 2,
      basedOn: 1,
      basedOnCurrent: true,
    });

    expect(await store.read('sample')).toMatchObject({
      number: 2,
      basedOn: 1,
      author: 'claude',
      html: stored('New'),
    });
    expect((await listCvs(store))[0]).toMatchObject({ id: 'sample', title: 'New' });
    expect(notified).toEqual(['sample']);
  });

  it('does not write or announce a document identical to the current one', async () => {
    await withSample();
    expect(await saveCvDocument(services(), 'sample', doc('Old'), 'claude')).toEqual({ kind: 'unchanged' });
    expect(await store.read('sample')).toMatchObject({ number: 1 });
    expect(notified).toEqual([]);
  });

  it('builds on the revision an address names, and says when newer ones are left out', async () => {
    await withSample();
    await saveCvDocument(services(), 'sample', doc('Second'), 'claude');
    expect(await saveCvDocument(services(), 'sample@1', doc('From the first'), 'claude')).toEqual({
      kind: 'saved',
      slug: 'sample',
      number: 3,
      basedOn: 1,
      basedOnCurrent: false,
    });
    expect(await store.read('sample')).toMatchObject({
      number: 3,
      basedOn: 1,
      html: stored('From the first'),
    });
  });

  it('writes a new revision when an address names the base, even for the current document', async () => {
    await withSample();
    expect(await saveCvDocument(services(), 'sample@1', doc('Old'), 'claude')).toMatchObject({
      kind: 'saved',
      number: 2,
      basedOnCurrent: true,
    });
  });

  it('reports a revision that does not exist without writing', async () => {
    await withSample();
    expect(await saveCvDocument(services(), 'sample@9', doc('New'), 'claude')).toEqual({
      kind: 'unknown-revision',
    });
    expect(await store.read('sample')).toMatchObject({ number: 1 });
  });

  it('rejects invalid ids and missing CVs without writing', async () => {
    expect(await saveCvDocument(services(), '../secret', doc('New'), 'claude')).toEqual({
      kind: 'invalid-id',
    });
    expect(await saveCvDocument(services(), 'missing', doc('New'), 'claude')).toEqual({ kind: 'not-found' });
    expect(await store.list()).toEqual([]);
  });

  it('measures the size limit in UTF-8 bytes, not characters', async () => {
    await withSample();
    // Two bytes per Cyrillic letter: under the limit in characters, over it in bytes.
    const filler = 'ж'.repeat(MAX_CV_DOCUMENT_BYTES / 2);
    expect(await saveCvDocument(services(), 'sample', doc(filler), 'claude')).toMatchObject({
      kind: 'too-large',
      limitBytes: MAX_CV_DOCUMENT_BYTES,
    });
    expect(await store.read('sample')).toMatchObject({ number: 1 });
  });

  it('stores the document with the styles of its template, and the same document again changes nothing', async () => {
    await withSample();
    await saveCvDocument(services(), 'sample', doc('New'), 'claude');
    const current = (await store.read('sample'))!.html;
    expect(current).toContain('<style id="cv-lib" data-cv-lib="classic@0.0.2">\np {}');
    expect(await saveCvDocument(services(), 'sample', current, 'claude')).toEqual({ kind: 'unchanged' });
  });

  it('returns the problems of a document it cannot store', async () => {
    await withSample();
    expect(await saveCvDocument(services(), 'sample', doc('New', 'modern@1'), 'claude')).toMatchObject({
      kind: 'invalid-document',
      problems: [expect.stringContaining('Unknown template "modern@1"')],
    });
    expect(await saveCvDocument(services(), 'sample', doc('New').replace('</html>', ''), 'claude')).toEqual({
      kind: 'invalid-document',
      problems: ['The document must end with </html>; it may have been cut off.'],
    });
    expect(await store.read('sample')).toMatchObject({ number: 1 });
  });
});

describe('createCvDocument', () => {
  it('creates a CV at revision 1 by its author and announces it', async () => {
    expect(await createCvDocument(services(), 'fresh', doc('Fresh'), 'claude')).toEqual({ kind: 'created' });
    expect(await store.read('fresh')).toMatchObject({ number: 1, author: 'claude', html: stored('Fresh') });
    expect((await listCvs(store))[0]).toMatchObject({ id: 'fresh', title: 'Fresh' });
    expect(notified).toEqual(['fresh']);
  });

  it('reports an id that is already taken, announcing nothing', async () => {
    await withSample();
    expect(await createCvDocument(services(), 'sample', doc('Other'), 'claude')).toEqual({
      kind: 'already-exists',
    });
    expect(notified).toEqual([]);
  });

  it('checks the id and the document before touching the store', async () => {
    expect(await createCvDocument(services(), '../secret', doc('New'), 'claude')).toEqual({
      kind: 'invalid-id',
    });
    expect(
      await createCvDocument(services(), 'fresh', doc('New').replace('</html>', ''), 'claude'),
    ).toMatchObject({
      kind: 'invalid-document',
    });
    expect(await store.list()).toEqual([]);
  });
});
