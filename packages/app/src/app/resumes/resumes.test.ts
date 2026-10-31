import { beforeEach, describe, expect, it } from 'vitest';
import type { HtmlParser, TemplateCatalog } from '../../domain/index.ts';
import { ResumeChanges } from '../resume-changes/resume-changes.ts';
import { InMemoryResumeRepository } from '../testing/in-memory-resume-repository.ts';
import {
  createResumeDocument,
  readResumeDocument,
  listResumes,
  MAX_RESUME_DOCUMENT_BYTES,
  saveResumeDocument,
} from './resumes.ts';

const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.3'],
  styles: (ref) => (ref === 'classic@0.0.3' ? 'p {}' : null),
  guide: () => null,
  schema: () => null,
};

// No template in these tests has a schema, so the tree is never looked at; the document comes back as it was.
const parseHtml: HtmlParser = (html) => ({
  tree: { tag: 'html', attributes: new Map(), children: [] },
  html,
});

/** A whole document naming a template; `stored` is the same after the template styles were put in. */
const doc = (title: string, template = 'classic@0.0.3') =>
  `<!doctype html><html><head><meta name="resume:title" content="${title}"><meta name="resume:template" content="${template}"></head><body></body></html>`;
const stored = (title: string) =>
  doc(title).replace(
    '</head>',
    '  <style id="resume-lib" data-resume-lib="classic@0.0.3">\np {}\n  </style>\n</head>',
  );

let repository: InMemoryResumeRepository;
let resumeChanges: ResumeChanges;
let notified: string[];

const dependencies = () => ({ repository, templates, parseHtml, resumeChanges });

beforeEach(() => {
  repository = new InMemoryResumeRepository();
  resumeChanges = new ResumeChanges();
  notified = [];
  resumeChanges.onChange((slug) => notified.push(slug));
});

/** A CV "sample" at revision 1, created before the test starts listening. */
async function withSample(title = 'Old') {
  await createResumeDocument(dependencies(), 'sample', doc(title), 'system');
  notified.length = 0;
}

describe('listResumes', () => {
  it('lists the CVs by slug, most recently changed first', async () => {
    await createResumeDocument(dependencies(), 'older', doc('Older'), 'system');
    await createResumeDocument(dependencies(), 'newer', doc('Newer'), 'system');
    expect(await listResumes(repository)).toEqual([
      expect.objectContaining({ slug: 'newer', title: 'Newer' }),
      expect.objectContaining({ slug: 'older', title: 'Older' }),
    ]);
  });
});

describe('readResumeDocument', () => {
  it('returns the current document', async () => {
    await withSample();
    expect(await readResumeDocument(repository, 'sample')).toEqual({
      kind: 'found',
      slug: 'sample',
      html: stored('Old'),
      number: 1,
      current: 1,
    });
  });

  it('returns an earlier revision by its address', async () => {
    await withSample();
    await saveResumeDocument(dependencies(), 'sample', doc('New'), 'claude');
    expect(await readResumeDocument(repository, 'sample@1')).toMatchObject({
      number: 1,
      current: 2,
      html: stored('Old'),
    });
    expect(await readResumeDocument(repository, 'sample@9')).toEqual({ kind: 'not-found' });
    expect(await readResumeDocument(repository, 'sample@0')).toEqual({ kind: 'invalid-slug' });
  });

  it('distinguishes an invalid slug from a missing CV', async () => {
    expect(await readResumeDocument(repository, '../secret')).toEqual({ kind: 'invalid-slug' });
    expect(await readResumeDocument(repository, 'missing')).toEqual({ kind: 'not-found' });
  });
});

describe('saveResumeDocument', () => {
  it('writes the next revision by its author, takes the title from it and announces the change', async () => {
    await withSample();
    expect(await saveResumeDocument(dependencies(), 'sample', doc('New'), 'claude')).toEqual({
      kind: 'saved',
      slug: 'sample',
      number: 2,
      basedOn: 1,
      basedOnCurrent: true,
    });

    expect(await repository.read('sample')).toMatchObject({
      number: 2,
      basedOn: 1,
      author: 'claude',
      html: stored('New'),
    });
    expect((await listResumes(repository))[0]).toMatchObject({ slug: 'sample', title: 'New' });
    expect(notified).toEqual(['sample']);
  });

  it('does not write or announce a document identical to the current one', async () => {
    await withSample();
    expect(await saveResumeDocument(dependencies(), 'sample', doc('Old'), 'claude')).toEqual({
      kind: 'unchanged',
    });
    expect(await repository.read('sample')).toMatchObject({ number: 1 });
    expect(notified).toEqual([]);
  });

  it('builds on the revision an address names, and says when newer ones are left out', async () => {
    await withSample();
    await saveResumeDocument(dependencies(), 'sample', doc('Second'), 'claude');
    expect(await saveResumeDocument(dependencies(), 'sample@1', doc('From the first'), 'claude')).toEqual({
      kind: 'saved',
      slug: 'sample',
      number: 3,
      basedOn: 1,
      basedOnCurrent: false,
    });
    expect(await repository.read('sample')).toMatchObject({
      number: 3,
      basedOn: 1,
      html: stored('From the first'),
    });
  });

  it('writes a new revision when an address names the base, even for the current document', async () => {
    await withSample();
    expect(await saveResumeDocument(dependencies(), 'sample@1', doc('Old'), 'claude')).toMatchObject({
      kind: 'saved',
      number: 2,
      basedOnCurrent: true,
    });
  });

  it('reports a revision that does not exist without writing', async () => {
    await withSample();
    expect(await saveResumeDocument(dependencies(), 'sample@9', doc('New'), 'claude')).toEqual({
      kind: 'unknown-revision',
    });
    expect(await repository.read('sample')).toMatchObject({ number: 1 });
  });

  it('rejects invalid ids and missing CVs without writing', async () => {
    expect(await saveResumeDocument(dependencies(), '../secret', doc('New'), 'claude')).toEqual({
      kind: 'invalid-slug',
    });
    expect(await saveResumeDocument(dependencies(), 'missing', doc('New'), 'claude')).toEqual({
      kind: 'not-found',
    });
    expect(await repository.list()).toEqual([]);
  });

  it('measures the size limit in UTF-8 bytes, not characters', async () => {
    await withSample();
    // Two bytes per Cyrillic letter: under the limit in characters, over it in bytes.
    const filler = 'ж'.repeat(MAX_RESUME_DOCUMENT_BYTES / 2);
    expect(await saveResumeDocument(dependencies(), 'sample', doc(filler), 'claude')).toMatchObject({
      kind: 'too-large',
      limitBytes: MAX_RESUME_DOCUMENT_BYTES,
    });
    expect(await repository.read('sample')).toMatchObject({ number: 1 });
  });

  it('stores the document with the styles of its template, and the same document again changes nothing', async () => {
    await withSample();
    await saveResumeDocument(dependencies(), 'sample', doc('New'), 'claude');
    const current = (await repository.read('sample'))!.html;
    expect(current).toContain('<style id="resume-lib" data-resume-lib="classic@0.0.3">\np {}');
    expect(await saveResumeDocument(dependencies(), 'sample', current, 'claude')).toEqual({
      kind: 'unchanged',
    });
  });

  it('returns the problems of a document it cannot repository', async () => {
    await withSample();
    expect(
      await saveResumeDocument(dependencies(), 'sample', doc('New', 'modern@1'), 'claude'),
    ).toMatchObject({
      kind: 'invalid-document',
      problems: [expect.stringContaining('Unknown template "modern@1"')],
    });
    expect(
      await saveResumeDocument(dependencies(), 'sample', doc('New').replace('</html>', ''), 'claude'),
    ).toEqual({
      kind: 'invalid-document',
      problems: ['The document must end with </html>; it may have been cut off.'],
    });
    expect(await repository.read('sample')).toMatchObject({ number: 1 });
  });
});

describe('createResumeDocument', () => {
  it('creates a CV at revision 1 by its author and announces it', async () => {
    expect(await createResumeDocument(dependencies(), 'fresh', doc('Fresh'), 'claude')).toEqual({
      kind: 'created',
    });
    expect(await repository.read('fresh')).toMatchObject({
      number: 1,
      author: 'claude',
      html: stored('Fresh'),
    });
    expect((await listResumes(repository))[0]).toMatchObject({ slug: 'fresh', title: 'Fresh' });
    expect(notified).toEqual(['fresh']);
  });

  it('reports a slug that is already taken, announcing nothing', async () => {
    await withSample();
    expect(await createResumeDocument(dependencies(), 'sample', doc('Other'), 'claude')).toEqual({
      kind: 'already-exists',
    });
    expect(notified).toEqual([]);
  });

  it('checks the slug and the document before touching the repository', async () => {
    expect(await createResumeDocument(dependencies(), '../secret', doc('New'), 'claude')).toEqual({
      kind: 'invalid-slug',
    });
    expect(
      await createResumeDocument(dependencies(), 'fresh', doc('New').replace('</html>', ''), 'claude'),
    ).toMatchObject({
      kind: 'invalid-document',
    });
    expect(await repository.list()).toEqual([]);
  });
});
