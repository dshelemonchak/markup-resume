import { describe, expect, it } from 'vitest';
import type { CvRepository, CvSummary } from '../domain/index.ts';
import { getCvDocument, listCvs } from './cvs.ts';

function fakeRepository(cvs: CvSummary[], documents: Record<string, string> = {}): CvRepository {
  return {
    list: () => Promise.resolve(cvs),
    getDocument: (id) => Promise.resolve(documents[id] ?? null),
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
