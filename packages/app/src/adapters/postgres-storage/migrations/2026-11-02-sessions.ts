import { type Kysely, sql } from 'kysely';

/**
 * Sign-in sessions for the UI (ADR-0027). The cookie holds a random token; the table holds only its SHA-256 hash, so
 * a leaked table cannot be replayed as cookies. A session ends at expires_at, or earlier when it has been idle too
 * long: the app reads last_seen_at for that, so the idle limit can change without a migration.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'bytea', (col) => col.notNull().check(sql`octet_length(token_hash) = 32`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('sessions_token_hash_unique', ['token_hash'])
    .execute();

  // "Every session of this user": sign out everywhere, or end the sessions of a banned user.
  await db.schema.createIndex('sessions_user_id_index').on('sessions').column('user_id').execute();
}
