import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './database-types.generated.ts';

/** The database schema as types, generated from the migrated database by `pnpm db:types` (schema.ts). */
export type Database = DB;

/** Connects to Postgres; the composition root creates one per process and closes it on shutdown. */
export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}
