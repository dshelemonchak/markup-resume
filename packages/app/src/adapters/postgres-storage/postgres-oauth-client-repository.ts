import type { Kysely } from 'kysely';
import type { OAuthClient, OAuthClientRepository } from '../../domain/index.ts';
import type { Database } from './database.ts';

/** Registered OAuth clients in Postgres (oauth_clients, ADR-0028). */
export class PostgresOAuthClientRepository implements OAuthClientRepository {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async register(client: Omit<OAuthClient, 'id'>): Promise<OAuthClient> {
    const row = await this.db
      .insertInto('oauth_clients')
      .values({
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: [...client.redirectUris],
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id, ...client };
  }

  async findByClientId(clientId: string): Promise<OAuthClient | null> {
    const row = await this.db
      .selectFrom('oauth_clients')
      .select(['id', 'client_id', 'client_name', 'redirect_uris'])
      .where('client_id', '=', clientId)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      redirectUris: row.redirect_uris,
    };
  }
}
