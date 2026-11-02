import type { Kysely } from 'kysely';
import type { CreateUserResult, ExternalIdentity, User, UserRepository } from '../../domain/index.ts';
import type { Database } from './database.ts';
import { isUniqueViolation } from './unique-violation.ts';

/** People and their sign-in identities in Postgres (users and user_identities, ADR-0025). */
export class PostgresUserRepository implements UserRepository {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async findByIdentity(identity: ExternalIdentity): Promise<User | null> {
    const user = await this.db
      .selectFrom('user_identities')
      .innerJoin('users', 'users.id', 'user_identities.user_id')
      .select(['users.id', 'users.name'])
      .where('user_identities.provider', '=', identity.provider)
      .where('user_identities.provider_user_id', '=', identity.providerUserId)
      .executeTakeFirst();
    return user ?? null;
  }

  async createWithIdentity(identity: ExternalIdentity): Promise<CreateUserResult> {
    try {
      const user = await this.db.transaction().execute(async (trx) => {
        const created = await trx
          .insertInto('users')
          .values({ name: identity.name, email: identity.email })
          .returning(['id', 'name'])
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('user_identities')
          .values({
            user_id: created.id,
            provider: identity.provider,
            provider_user_id: identity.providerUserId,
            email: identity.email,
          })
          .execute();
        return created;
      });
      return { kind: 'created', user };
    } catch (error) {
      // The transaction rolled back, so the user row from this attempt is gone too.
      if (isUniqueViolation(error, 'user_identities_provider_user_unique')) {
        return { kind: 'identity-taken' };
      }
      throw error;
    }
  }
}
