import { type Kysely, sql } from 'kysely';
import { createDatabase, type Database } from './database.ts';
import { ensureLocalOwner } from './local-owner.ts';
import { migrateToLatest } from './migration.ts';
import { PgCvStore } from './pg-cv-store.ts';

/**
 * What every composition root needs from the database: a connection that answers (it fails at once otherwise), the
 * schema brought up to date, and the CV store acting for the local owner.
 */
export async function openCvStore(databaseUrl: string): Promise<{ db: Kysely<Database>; store: PgCvStore }> {
  const db = createDatabase(databaseUrl);
  await sql`select 1`.execute(db);
  await migrateToLatest(db);
  const owner = await ensureLocalOwner(db);
  return { db, store: new PgCvStore(db, owner) };
}
