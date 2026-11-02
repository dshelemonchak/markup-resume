import type { Kysely } from 'kysely';
import type { NewSession, Session, SessionRepository } from '../../domain/index.ts';
import type { Database } from './database.ts';

/** Sign-in sessions in Postgres (ADR-0027): the token's hash in a bytea column, never the token. */
export class PostgresSessionRepository implements SessionRepository {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async create(session: NewSession): Promise<void> {
    await this.db
      .insertInto('sessions')
      .values({
        user_id: session.userId,
        token_hash: Buffer.from(session.tokenHash),
        expires_at: session.expiresAt,
      })
      .execute();
  }

  async findActive(
    tokenHash: Uint8Array,
    at: { readonly now: Date; readonly idleSince: Date },
  ): Promise<Session | null> {
    const row = await this.db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .select(['sessions.id', 'sessions.last_seen_at', 'users.id as user_id', 'users.name as user_name'])
      .where('sessions.token_hash', '=', Buffer.from(tokenHash))
      .where('sessions.expires_at', '>', at.now)
      .where('sessions.last_seen_at', '>=', at.idleSince)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return { id: row.id, user: { id: row.user_id, name: row.user_name }, lastSeenAt: row.last_seen_at };
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.updateTable('sessions').set({ last_seen_at: at }).where('id', '=', id).execute();
  }

  async delete(tokenHash: Uint8Array): Promise<void> {
    await this.db.deleteFrom('sessions').where('token_hash', '=', Buffer.from(tokenHash)).execute();
  }
}
