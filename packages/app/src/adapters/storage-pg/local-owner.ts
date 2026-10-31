import type { Kysely } from 'kysely';
import type { Database } from './database.ts';

/**
 * The owner of every CV until sign-in exists: the one user in the database, created on first start. When GitHub
 * sign-in arrives (ADR-0023), users come only from signing in and this goes away.
 */
export async function ensureLocalOwner(db: Kysely<Database>): Promise<string> {
  const existing = await db.selectFrom('users').select('id').orderBy('created_at').executeTakeFirst();
  if (existing) {
    return existing.id;
  }
  const created = await db
    .insertInto('users')
    .values({ name: 'Local user' })
    .returning('id')
    .executeTakeFirstOrThrow();
  return created.id;
}
