import type { Kysely } from 'kysely';
import type {
  AccessGrant,
  ConsumeCodeResult,
  NewAuthorizationCode,
  NewTokenFamily,
  NewTokens,
  OAuthGrantRepository,
  RotateRefreshTokenResult,
} from '../../domain/index.ts';
import type { Database } from './database.ts';

/**
 * Authorisation codes and token families in Postgres (ADR-0028). What must happen once is one statement or one
 * transaction with a row lock, so two requests racing with the same code or refresh token cannot both win.
 */
export class PostgresOAuthGrantRepository implements OAuthGrantRepository {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async createCode(code: NewAuthorizationCode): Promise<void> {
    await this.db
      .insertInto('oauth_authorization_codes')
      .values({
        code_hash: Buffer.from(code.codeHash),
        client_id: code.clientId,
        user_id: code.userId,
        redirect_uri: code.redirectUri,
        code_challenge: code.codeChallenge,
        resource: code.resource,
        expires_at: code.expiresAt,
      })
      .execute();
  }

  async consumeCode(codeHash: Uint8Array, now: Date): Promise<ConsumeCodeResult> {
    const hash = Buffer.from(codeHash);
    // One statement: of two concurrent exchanges, only one finds used_at still null.
    const consumed = await this.db
      .updateTable('oauth_authorization_codes')
      .set({ used_at: now })
      .where('code_hash', '=', hash)
      .where('used_at', 'is', null)
      .returning(['id', 'client_id', 'user_id', 'redirect_uri', 'code_challenge', 'resource', 'expires_at'])
      .executeTakeFirst();
    if (consumed) {
      return {
        kind: 'consumed',
        code: {
          id: consumed.id,
          clientId: consumed.client_id,
          userId: consumed.user_id,
          redirectUri: consumed.redirect_uri,
          codeChallenge: consumed.code_challenge,
          resource: consumed.resource,
          expiresAt: consumed.expires_at,
        },
      };
    }
    const used = await this.db
      .selectFrom('oauth_authorization_codes')
      .select('id')
      .where('code_hash', '=', hash)
      .executeTakeFirst();
    return used ? { kind: 'reused', codeId: used.id } : { kind: 'not-found' };
  }

  async revokeFamilyOfCode(codeId: string, now: Date): Promise<void> {
    await this.db
      .updateTable('oauth_token_families')
      .set({ revoked_at: now })
      .where('authorization_code_id', '=', codeId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async createFamily(family: NewTokenFamily, tokens: NewTokens): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('oauth_token_families')
        .values({
          client_id: family.clientId,
          user_id: family.userId,
          authorization_code_id: family.authorizationCodeId,
          resource: family.resource,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await insertTokens(trx, created.id, tokens);
    });
  }

  async findAccessToken(tokenHash: Uint8Array, now: Date): Promise<AccessGrant | null> {
    const row = await this.db
      .selectFrom('oauth_access_tokens as token')
      .innerJoin('oauth_token_families as family', 'family.id', 'token.family_id')
      .innerJoin('oauth_clients as client', 'client.id', 'family.client_id')
      .select(['family.user_id', 'client.client_id', 'family.resource', 'token.expires_at'])
      .where('token.token_hash', '=', Buffer.from(tokenHash))
      .where('token.expires_at', '>', now)
      .where('family.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      clientId: row.client_id,
      resource: row.resource,
      expiresAt: row.expires_at,
    };
  }

  async rotateRefreshToken(
    tokenHash: Uint8Array,
    client: { readonly id: string },
    now: Date,
    next: NewTokens,
  ): Promise<RotateRefreshTokenResult> {
    return this.db.transaction().execute(async (trx) => {
      // The lock makes a second request with the same token wait, and then see it used.
      const token = await trx
        .selectFrom('oauth_refresh_tokens as token')
        .innerJoin('oauth_token_families as family', 'family.id', 'token.family_id')
        .select([
          'token.id',
          'token.family_id',
          'token.expires_at',
          'token.used_at',
          'family.client_id',
          'family.revoked_at',
        ])
        .where('token.token_hash', '=', Buffer.from(tokenHash))
        .forUpdate('token')
        .executeTakeFirst();
      if (!token || token.revoked_at !== null || token.expires_at <= now || token.client_id !== client.id) {
        return { kind: 'invalid' };
      }
      if (token.used_at !== null) {
        // A rotated token came back: it was stolen, or the client is broken. End the whole family.
        await trx
          .updateTable('oauth_token_families')
          .set({ revoked_at: now })
          .where('id', '=', token.family_id)
          .execute();
        return { kind: 'reused' };
      }
      await trx
        .updateTable('oauth_refresh_tokens')
        .set({ used_at: now })
        .where('id', '=', token.id)
        .execute();
      await insertTokens(trx, token.family_id, next);
      return { kind: 'rotated' };
    });
  }

  async deleteExpired(before: Date): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const results = [
        await trx.deleteFrom('oauth_access_tokens').where('expires_at', '<', before).executeTakeFirst(),
        await trx.deleteFrom('oauth_refresh_tokens').where('expires_at', '<', before).executeTakeFirst(),
        // A family with no tokens left can grant nothing more.
        await trx
          .deleteFrom('oauth_token_families as family')
          .where((eb) =>
            eb.and([
              eb.not(
                eb.exists(
                  eb.selectFrom('oauth_access_tokens').select('id').whereRef('family_id', '=', 'family.id'),
                ),
              ),
              eb.not(
                eb.exists(
                  eb.selectFrom('oauth_refresh_tokens').select('id').whereRef('family_id', '=', 'family.id'),
                ),
              ),
            ]),
          )
          .executeTakeFirst(),
        // A code goes only once no family refers to it: deleting it would delete its family too.
        await trx
          .deleteFrom('oauth_authorization_codes as code')
          .where('code.expires_at', '<', before)
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom('oauth_token_families')
                  .select('id')
                  .whereRef('authorization_code_id', '=', 'code.id'),
              ),
            ),
          )
          .executeTakeFirst(),
      ];
      return results.reduce((sum, result) => sum + Number(result.numDeletedRows), 0);
    });
  }
}

async function insertTokens(trx: Kysely<Database>, familyId: string, tokens: NewTokens): Promise<void> {
  await trx
    .insertInto('oauth_access_tokens')
    .values({
      token_hash: Buffer.from(tokens.accessTokenHash),
      family_id: familyId,
      expires_at: tokens.accessTokenExpiresAt,
    })
    .execute();
  await trx
    .insertInto('oauth_refresh_tokens')
    .values({
      token_hash: Buffer.from(tokens.refreshTokenHash),
      family_id: familyId,
      expires_at: tokens.refreshTokenExpiresAt,
    })
    .execute();
}
