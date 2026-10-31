import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type {
  CvListing,
  CvStore,
  NewCv,
  NewRevision,
  StoredRevision,
  WriteResult,
} from '../../domain/index.ts';
import type { Database } from './database.ts';

/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * CV storage in Postgres on the schema of ADR-0025, acting for one owner. Every write is one transaction, and the
 * database keeps the rules: the current revision belongs to its CV, numbers are unique per CV, slugs per owner.
 */
export class PgCvStore implements CvStore {
  private readonly db: Kysely<Database>;
  private readonly ownerId: string;

  constructor(db: Kysely<Database>, ownerId: string) {
    this.db = db;
    this.ownerId = ownerId;
  }

  async list(): Promise<readonly CvListing[]> {
    const rows = await this.db
      .selectFrom('cvs')
      .innerJoin('revisions', 'revisions.id', 'cvs.current_revision_id')
      .select(['cvs.slug', 'cvs.title', 'cvs.updated_at', 'revisions.number'])
      .where('cvs.owner_id', '=', this.ownerId)
      .where('cvs.deleted_at', 'is', null)
      .orderBy('cvs.updated_at', 'desc')
      .execute();
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      revision: row.number,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async read(slug: string, number?: number): Promise<StoredRevision | null> {
    let query = this.db
      .selectFrom('cvs')
      .innerJoin('revisions as current', 'current.id', 'cvs.current_revision_id')
      .innerJoin('revisions', 'revisions.cv_id', 'cvs.id')
      .leftJoin('revisions as base', 'base.id', 'revisions.based_on_id')
      .select([
        'cvs.slug',
        'revisions.number',
        'current.number as current_number',
        'base.number as based_on_number',
        'revisions.cv_html',
        'revisions.template_name',
        'revisions.template_version',
        'revisions.author',
        'revisions.kind',
        'revisions.created_at',
      ])
      .where('cvs.owner_id', '=', this.ownerId)
      .where('cvs.slug', '=', slug)
      .where('cvs.deleted_at', 'is', null);
    if (number === undefined) {
      query = query.whereRef('revisions.id', '=', 'cvs.current_revision_id');
    } else {
      query = query.where('revisions.number', '=', number);
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
      html: row.cv_html,
      template: { name: row.template_name, version: row.template_version },
      author: row.author,
      kind: row.kind,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(cv: NewCv): Promise<'created' | 'slug-taken'> {
    // Both ids are made here: the CV points at its first revision before that row exists. The foreign key is
    // checked at commit (ADR-0025), when both rows are in.
    const cvId = randomUUID();
    const revisionId = randomUUID();
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('cvs')
          .values({
            id: cvId,
            owner_id: this.ownerId,
            slug: cv.slug,
            title: cv.title,
            current_revision_id: revisionId,
          })
          .execute();
        await trx
          .insertInto('revisions')
          .values({
            id: revisionId,
            cv_id: cvId,
            number: 1,
            based_on_id: null,
            author: cv.author,
            kind: 'write',
            cv_html: cv.html,
            template_name: cv.template.name,
            template_version: cv.template.version,
          })
          .execute();
      });
      return 'created';
    } catch (error) {
      if (isUniqueViolation(error, 'cvs_owner_slug_unique')) {
        return 'slug-taken';
      }
      throw error;
    }
  }

  async write(revision: NewRevision): Promise<WriteResult> {
    return this.db.transaction().execute(async (trx) => {
      // Locks the CV's row until commit: writes to one CV take turns, so each sees the latest number.
      const cv = await trx
        .selectFrom('cvs')
        .select(['id', 'current_revision_id'])
        .where('owner_id', '=', this.ownerId)
        .where('slug', '=', revision.slug)
        .where('deleted_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!cv) {
        return { kind: 'not-found' };
      }

      let baseQuery = trx.selectFrom('revisions').select(['id', 'number']).where('cv_id', '=', cv.id);
      if (revision.basedOn === undefined) {
        baseQuery = baseQuery.where('id', '=', cv.current_revision_id);
      } else {
        baseQuery = baseQuery.where('number', '=', revision.basedOn);
      }
      const base = await baseQuery.executeTakeFirst();
      if (!base) {
        return { kind: 'unknown-base' };
      }

      const { last } = await trx
        .selectFrom('revisions')
        .select((eb) => eb.fn.max('number').as('last'))
        .where('cv_id', '=', cv.id)
        .executeTakeFirstOrThrow();
      const number = last + 1;
      const revisionId = randomUUID();

      await trx
        .insertInto('revisions')
        .values({
          id: revisionId,
          cv_id: cv.id,
          number,
          based_on_id: base.id,
          author: revision.author,
          kind: revision.kind,
          cv_html: revision.html,
          template_name: revision.template.name,
          template_version: revision.template.version,
        })
        .execute();
      await trx
        .updateTable('cvs')
        .set({ current_revision_id: revisionId, title: revision.title, updated_at: new Date() })
        .where('id', '=', cv.id)
        .execute();

      return {
        kind: 'written',
        number,
        basedOn: base.number,
        basedOnCurrent: base.id === cv.current_revision_id,
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
