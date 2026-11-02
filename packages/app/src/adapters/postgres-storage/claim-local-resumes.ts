import type { Kysely } from 'kysely';
import type { Database } from './database.ts';

export type ClaimLocalResumesResult =
  | { readonly kind: 'claimed'; readonly resumes: number }
  /** There is no local owner: nothing came from an earlier version, or it was claimed already. */
  | { readonly kind: 'nothing-to-claim' }
  /** The owner already has CVs with these slugs; nothing was moved. */
  | { readonly kind: 'slug-conflicts'; readonly slugs: readonly string[] };

/**
 * Moves the CVs of the local owner, the user without a sign-in identity that versions before sign-in created, to a
 * signed-in user, and removes the local owner (ADR-0027). One transaction: all of it or nothing.
 */
export async function claimLocalResumes(
  db: Kysely<Database>,
  ownerId: string,
): Promise<ClaimLocalResumesResult> {
  return db.transaction().execute(async (trx) => {
    const localUsers = await trx
      .selectFrom('users')
      .select('id')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('user_identities')
              .select('user_identities.id')
              .whereRef('user_identities.user_id', '=', 'users.id'),
          ),
        ),
      )
      .execute();
    const localIds = localUsers.map((user) => user.id);
    if (localIds.length === 0) {
      return { kind: 'nothing-to-claim' };
    }

    const conflicts = await trx
      .selectFrom('resumes as local')
      .innerJoin('resumes as mine', 'mine.slug', 'local.slug')
      .select('local.slug')
      .where('local.owner_id', 'in', localIds)
      .where('mine.owner_id', '=', ownerId)
      .execute();
    if (conflicts.length > 0) {
      return { kind: 'slug-conflicts', slugs: conflicts.map((conflict) => conflict.slug) };
    }

    const moved = await trx
      .updateTable('resumes')
      .set({ owner_id: ownerId })
      .where('owner_id', 'in', localIds)
      .executeTakeFirst();
    await trx.deleteFrom('users').where('id', 'in', localIds).execute();
    return { kind: 'claimed', resumes: Number(moved.numUpdatedRows) };
  });
}
