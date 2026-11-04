import { type Kysely, sql } from 'kysely';

/**
 * OAuth 2.1 for MCP (ADR-0028): registered clients, authorisation codes, and token families with their access and
 * refresh tokens. Codes and tokens are stored only as SHA-256 hashes, like sessions. A family starts with a code and
 * holds every token refreshed from it, so one reuse of a code or a rotated refresh token revokes all of them.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // A client that registered itself (RFC 7591): public, so it has no secret.
  await db.schema
    .createTable('oauth_clients')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('client_id', 'text', (col) => col.notNull())
    .addColumn('client_name', 'text')
    .addColumn('redirect_uris', sql`text[]`, (col) =>
      col.notNull().check(sql`cardinality(redirect_uris) > 0`),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('oauth_clients_client_id_unique', ['client_id'])
    .execute();

  // A code the user approved, for one client, redirect URI, PKCE challenge and resource; usable once, briefly.
  await db.schema
    .createTable('oauth_authorization_codes')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('code_hash', 'bytea', (col) => col.notNull().check(sql`octet_length(code_hash) = 32`))
    .addColumn('client_id', 'uuid', (col) => col.notNull().references('oauth_clients.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('redirect_uri', 'text', (col) => col.notNull())
    .addColumn('code_challenge', 'text', (col) => col.notNull())
    .addColumn('resource', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('oauth_authorization_codes_code_hash_unique', ['code_hash'])
    .execute();

  // The tokens issued from one code. Revoking the family ends every token in it.
  await db.schema
    .createTable('oauth_token_families')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('client_id', 'uuid', (col) => col.notNull().references('oauth_clients.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('authorization_code_id', 'uuid', (col) =>
      col.notNull().references('oauth_authorization_codes.id').onDelete('cascade'),
    )
    .addColumn('resource', 'text', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('oauth_token_families_code_unique', ['authorization_code_id'])
    .execute();

  for (const table of ['oauth_access_tokens', 'oauth_refresh_tokens'] as const) {
    await db.schema
      .createTable(table)
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('token_hash', 'bytea', (col) => col.notNull().check(sql`octet_length(token_hash) = 32`))
      .addColumn('family_id', 'uuid', (col) =>
        col.notNull().references('oauth_token_families.id').onDelete('cascade'),
      )
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint(`${table}_token_hash_unique`, ['token_hash'])
      .execute();
  }
  // A refresh token is used once: rotation marks it, and a second use is the sign of a stolen token.
  await db.schema.alterTable('oauth_refresh_tokens').addColumn('used_at', 'timestamptz').execute();
}
