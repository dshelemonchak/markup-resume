import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type {
  ResumeListItem,
  ResumeRepository,
  CreateResumeInput,
  WriteRevisionInput,
  ResumeRevision,
  WriteRevisionResult,
} from '../../domain/index.ts';
import type { Database } from './database.ts';

/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * CV storage in Postgres on the schema of ADR-0025, acting for one owner. Every write is one transaction, and the
 * database keeps the rules: the current revision belongs to its CV, numbers are unique per CV, slugs per owner.
 */
export class PostgresResumeRepository implements ResumeRepository {
  private readonly db: Kysely<Database>;
  private readonly ownerId: string;

  constructor(db: Kysely<Database>, ownerId: string) {
    this.db = db;
    this.ownerId = ownerId;
  }

  async list(): Promise<readonly ResumeListItem[]> {
    const rows = await this.db
      .selectFrom('resumes')
      .innerJoin('resume_revisions', 'resume_revisions.id', 'resumes.current_revision_id')
      .select(['resumes.slug', 'resumes.title', 'resumes.updated_at', 'resume_revisions.number'])
      .where('resumes.owner_id', '=', this.ownerId)
      .where('resumes.deleted_at', 'is', null)
      .orderBy('resumes.updated_at', 'desc')
      .execute();
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      revision: row.number,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async read(slug: string, number?: number): Promise<ResumeRevision | null> {
    let query = this.db
      .selectFrom('resumes')
      .innerJoin('resume_revisions as current', 'current.id', 'resumes.current_revision_id')
      .innerJoin('resume_revisions', 'resume_revisions.resume_id', 'resumes.id')
      .leftJoin('resume_revisions as base', 'base.id', 'resume_revisions.based_on_id')
      .select([
        'resumes.slug',
        'resume_revisions.number',
        'current.number as current_number',
        'base.number as based_on_number',
        'resume_revisions.html',
        'resume_revisions.template_name',
        'resume_revisions.template_version',
        'resume_revisions.author',
        'resume_revisions.kind',
        'resume_revisions.created_at',
      ])
      .where('resumes.owner_id', '=', this.ownerId)
      .where('resumes.slug', '=', slug)
      .where('resumes.deleted_at', 'is', null);
    if (number === undefined) {
      query = query.whereRef('resume_revisions.id', '=', 'resumes.current_revision_id');
    } else {
      query = query.where('resume_revisions.number', '=', number);
    }
    const row = await query.executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      slug: row.slug,
      number: row.number,
      current: row.current_number,
      basedOn: row.based_on_number,
      html: row.html,
      template: { name: row.template_name, version: row.template_version },
      author: row.author,
      kind: row.kind,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(resume: CreateResumeInput): Promise<'created' | 'slug-taken'> {
    // Both ids are made here: the CV points at its first revision before that row exists. The foreign key is
    // checked at commit (ADR-0025), when both rows are in.
    const resumeId = randomUUID();
    const revisionId = randomUUID();
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('resumes')
          .values({
            id: resumeId,
            owner_id: this.ownerId,
            slug: resume.slug,
            title: resume.title,
            current_revision_id: revisionId,
          })
          .execute();
        await trx
          .insertInto('resume_revisions')
          .values({
            id: revisionId,
            resume_id: resumeId,
            number: 1,
            based_on_id: null,
            author: resume.author,
            kind: 'write',
            html: resume.html,
            template_name: resume.template.name,
            template_version: resume.template.version,
          })
          .execute();
      });
      return 'created';
    } catch (error) {
      if (isUniqueViolation(error, 'resumes_owner_slug_unique')) {
        return 'slug-taken';
      }
      throw error;
    }
  }

  async write(revision: WriteRevisionInput): Promise<WriteRevisionResult> {
    return this.db.transaction().execute(async (trx) => {
      // Locks the CV's row until commit: writes to one CV take turns, so each sees the latest number.
      const resume = await trx
        .selectFrom('resumes')
        .select(['id', 'current_revision_id'])
        .where('owner_id', '=', this.ownerId)
        .where('slug', '=', revision.slug)
        .where('deleted_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!resume) {
        return { kind: 'not-found' };
      }

      let baseQuery = trx
        .selectFrom('resume_revisions')
        .select(['id', 'number'])
        .where('resume_id', '=', resume.id);
      if (revision.basedOn === undefined) {
        baseQuery = baseQuery.where('id', '=', resume.current_revision_id);
      } else {
        baseQuery = baseQuery.where('number', '=', revision.basedOn);
      }
      const base = await baseQuery.executeTakeFirst();
      if (!base) {
        return { kind: 'unknown-base' };
      }

      const { last } = await trx
        .selectFrom('resume_revisions')
        .select((eb) => eb.fn.max('number').as('last'))
        .where('resume_id', '=', resume.id)
        .executeTakeFirstOrThrow();
      const number = last + 1;
      const revisionId = randomUUID();

      await trx
        .insertInto('resume_revisions')
        .values({
          id: revisionId,
          resume_id: resume.id,
          number,
          based_on_id: base.id,
          author: revision.author,
          kind: revision.kind,
          html: revision.html,
          template_name: revision.template.name,
          template_version: revision.template.version,
        })
        .execute();
      await trx
        .updateTable('resumes')
        .set({ current_revision_id: revisionId, title: revision.title, updated_at: new Date() })
        .where('id', '=', resume.id)
        .execute();

      return {
        kind: 'written',
        number,
        basedOn: base.number,
        basedOnCurrent: base.id === resume.current_revision_id,
      };
    });
  }
}

/** A pg error for a unique violation of the named constraint. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
