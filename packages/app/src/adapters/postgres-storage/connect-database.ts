import { type Kysely, sql } from 'kysely';
import { createDatabase, type Database } from './database.ts';
import { migrateToLatest } from './run-migrations.ts';

/**
 * What every composition root needs from the database: a connection that answers (it fails at once otherwise) and
 * the schema brought up to date.
 */
export async function connectDatabase(databaseUrl: string): Promise<Kysely<Database>> {
  const db = createDatabase(databaseUrl);
  await sql`select 1`.execute(db);
  await migrateToLatest(db);
  return db;
}

/** Whether the database answers now: for the health endpoint. */
export async function isDatabaseReachable(db: Kysely<Database>): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
