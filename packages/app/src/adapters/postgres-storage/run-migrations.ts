import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Applies every migration that has not run yet (ADR-0021). Throws on the first failure. */
export async function migrateToLatest<DB>(db: Kysely<DB>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
  });
  const { error, results } = await migrator.migrateToLatest();
  // results lists each migration it tried, with its status; error holds the failure, if there was one.

  if (error) {
    const itemsWithErrors = results?.filter((item) => item.status === 'Error') ?? [];
    const itemsWithErrorsNames = itemsWithErrors.map((item) => item.migrationName).join(', ');
    throw new Error(`Migration failed: ${itemsWithErrorsNames || 'before any migration ran'}`, {
      cause: error,
    });
  }

  results?.forEach((item) => {
    if (item.status === 'Success') {
      console.log(`Applied migration ${item.migrationName}`);
    }
  });
}
