import { type Kysely, sql } from 'kysely';
import { createDatabase, type Database } from './database.ts';
import { ensureLocalOwner } from './local-owner.ts';
import { migrateToLatest } from './run-migrations.ts';
import { PostgresResumeRepository } from './postgres-resume-repository.ts';

/**
 * What every composition root needs from the database: a connection that answers (it fails at once otherwise), the
 * schema brought up to date, and the CV repository acting for the local owner.
 */
export async function connectResumeRepository(
  databaseUrl: string,
): Promise<{ db: Kysely<Database>; repository: PostgresResumeRepository }> {
  const db = createDatabase(databaseUrl);
  await sql`select 1`.execute(db);
  await migrateToLatest(db);
  const owner = await ensureLocalOwner(db);
  return { db, repository: new PostgresResumeRepository(db, owner) };
}
