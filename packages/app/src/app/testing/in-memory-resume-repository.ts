import type {
  ResumeListItem,
  ResumeRepository,
  CreateResumeInput,
  WriteRevisionInput,
  ResumeRevision,
  WriteRevisionResult,
} from '../../domain/index.ts';

interface MemoryResume {
  title: string;
  current: number;
  updatedAt: string;
  readonly revisions: ResumeRevision[];
}

/**
 * ResumeRepository in memory, for tests of the use cases and adapters: the same rules as PostgresResumeRepository (numbers per CV, the
 * base recorded, the title from the last write), without a database. PostgresResumeRepository has its own tests against Postgres.
 */
export class InMemoryResumeRepository implements ResumeRepository {
  private readonly resumes = new Map<string, MemoryResume>();
  private clock = Date.parse('2026-10-31T10:00:00.000Z');

  list(): Promise<readonly ResumeListItem[]> {
    const listing = [...this.resumes.entries()]
      .map(([slug, resume]) => ({
        slug,
        title: resume.title,
        revision: resume.current,
        updatedAt: resume.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return Promise.resolve(listing);
  }

  read(slug: string, number?: number): Promise<ResumeRevision | null> {
    const resume = this.resumes.get(slug);
    const wanted = number ?? resume?.current;
    const revision = resume?.revisions.find((candidate) => candidate.number === wanted);
    return Promise.resolve(revision && resume ? { ...revision, current: resume.current } : null);
  }

  create(resume: CreateResumeInput): Promise<'created' | 'slug-taken'> {
    if (this.resumes.has(resume.slug)) {
      return Promise.resolve('slug-taken');
    }
    const now = this.tick();
    this.resumes.set(resume.slug, {
      title: resume.title,
      current: 1,
      updatedAt: now,
      revisions: [
        {
          slug: resume.slug,
          number: 1,
          current: 1,
          basedOn: null,
          html: resume.html,
          template: resume.template,
          author: resume.author,
          kind: 'write',
          createdAt: now,
        },
      ],
    });
    return Promise.resolve('created');
  }

  write(revision: WriteRevisionInput): Promise<WriteRevisionResult> {
    const resume = this.resumes.get(revision.slug);
    if (!resume) {
      return Promise.resolve({ kind: 'not-found' });
    }
    const base = revision.basedOn ?? resume.current;
    if (!resume.revisions.some((candidate) => candidate.number === base)) {
      return Promise.resolve({ kind: 'unknown-base' });
    }
    const number = resume.revisions.length + 1;
    const now = this.tick();
    resume.revisions.push({
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
    const basedOnCurrent = base === resume.current;
    resume.current = number;
    resume.title = revision.title;
    resume.updatedAt = now;
    return Promise.resolve({ kind: 'written', number, basedOn: base, basedOnCurrent });
  }

  /** Every change gets a later time, so "most recently changed first" is deterministic. */
  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
}
