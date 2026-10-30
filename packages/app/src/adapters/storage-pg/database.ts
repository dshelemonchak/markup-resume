import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

/** The database schema as types: no tables yet. The first migration brings them. */
export type Database = Record<string, never>;

/** Connects to Postgres; the composition root creates one per process and closes it on shutdown. */
export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  });
}
