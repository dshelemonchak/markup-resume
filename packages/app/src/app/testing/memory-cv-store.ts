import type {
  CvListing,
  CvStore,
  NewCv,
  NewRevision,
  StoredRevision,
  WriteResult,
} from '../../domain/index.ts';

interface MemoryCv {
  title: string;
  current: number;
  updatedAt: string;
  readonly revisions: StoredRevision[];
}

/**
 * CvStore in memory, for tests of the use cases and adapters: the same rules as PgCvStore (numbers per CV, the
 * base recorded, the title from the last write), without a database. PgCvStore has its own tests against Postgres.
 */
export class MemoryCvStore implements CvStore {
  private readonly cvs = new Map<string, MemoryCv>();
  private clock = Date.parse('2026-10-31T10:00:00.000Z');

  list(): Promise<readonly CvListing[]> {
    const listing = [...this.cvs.entries()]
      .map(([slug, cv]) => ({ slug, title: cv.title, revision: cv.current, updatedAt: cv.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return Promise.resolve(listing);
  }

  read(slug: string, number?: number): Promise<StoredRevision | null> {
    const cv = this.cvs.get(slug);
    const wanted = number ?? cv?.current;
    const revision = cv?.revisions.find((candidate) => candidate.number === wanted);
    return Promise.resolve(revision && cv ? { ...revision, current: cv.current } : null);
  }

  create(cv: NewCv): Promise<'created' | 'slug-taken'> {
    if (this.cvs.has(cv.slug)) {
      return Promise.resolve('slug-taken');
    }
    const now = this.tick();
    this.cvs.set(cv.slug, {
      title: cv.title,
      current: 1,
      updatedAt: now,
      revisions: [
        {
          slug: cv.slug,
          number: 1,
          current: 1,
          basedOn: null,
          html: cv.html,
          template: cv.template,
          author: cv.author,
          kind: 'write',
          createdAt: now,
        },
      ],
    });
    return Promise.resolve('created');
  }

  write(revision: NewRevision): Promise<WriteResult> {
    const cv = this.cvs.get(revision.slug);
    if (!cv) {
      return Promise.resolve({ kind: 'not-found' });
    }
    const base = revision.basedOn ?? cv.current;
    if (!cv.revisions.some((candidate) => candidate.number === base)) {
      return Promise.resolve({ kind: 'unknown-base' });
    }
    const number = cv.revisions.length + 1;
    const now = this.tick();
    cv.revisions.push({
      slug: revision.slug,
      number,
      current: number,
      basedOn: base,
      html: revision.html,
      template: revision.template,
      author: revision.author,
      kind: revision.kind,
      createdAt: now,
    });
    const basedOnCurrent = base === cv.current;
    cv.current = number;
    cv.title = revision.title;
    cv.updatedAt = now;
    return Promise.resolve({ kind: 'written', number, basedOn: base, basedOnCurrent });
  }

  /** Every change gets a later time, so "most recently changed first" is deterministic. */
  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
}
