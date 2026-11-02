// For the composition roots: the user that tools without a sign-in of their own act for (MCP until it has OAuth,
// pnpm seed, pnpm import:files, pnpm claim:local-resumes), named by OWNER_GITHUB_ID (ADR-0027).
import type { Kysely } from 'kysely';
import type { Database } from './adapters/postgres-storage/database.ts';
import { PostgresUserRepository } from './adapters/postgres-storage/postgres-user-repository.ts';
import type { User } from './domain/index.ts';

const HOW_TO_SET =
  'Set OWNER_GITHUB_ID to your GitHub user id (the "id" in https://api.github.com/users/<login>) and sign in once ' +
  'in the UI with that account.';

/** The owner, or why there is none. */
export async function findOwner(
  db: Kysely<Database>,
): Promise<
  { readonly kind: 'found'; readonly user: User } | { readonly kind: 'missing'; readonly reason: string }
> {
  const githubId = process.env['OWNER_GITHUB_ID'];
  if (!githubId) {
    return { kind: 'missing', reason: `OWNER_GITHUB_ID is not set. ${HOW_TO_SET}` };
  }
  const user = await new PostgresUserRepository(db).findByIdentity({
    provider: 'github',
    providerUserId: githubId,
  });
  if (!user) {
    return {
      kind: 'missing',
      reason: `Nobody has signed in with GitHub user ${githubId} yet. ${HOW_TO_SET}`,
    };
  }
  return { kind: 'found', user };
}

/** The owner; a tool that cannot work without one stops with what to do. */
export async function requireOwner(db: Kysely<Database>): Promise<User> {
  const owner = await findOwner(db);
  if (owner.kind === 'missing') {
    throw new Error(owner.reason);
  }
  return owner.user;
}
