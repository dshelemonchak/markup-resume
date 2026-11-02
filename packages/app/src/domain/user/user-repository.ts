import type { ExternalIdentity, User } from './user.ts';

/** Port: people and the identities they sign in with (users and user_identities, ADR-0025). */
export interface UserRepository {
  /** The user who signs in with this identity; null when nobody has signed in with it yet. */
  findByIdentity(identity: Pick<ExternalIdentity, 'provider' | 'providerUserId'>): Promise<User | null>;
  /**
   * A new user with this identity, named after it, in one transaction. identity-taken when someone already signs in
   * with it, e.g. a first sign-in of the same account that finished in another request.
   */
  createWithIdentity(identity: ExternalIdentity): Promise<CreateUserResult>;
}

export type CreateUserResult =
  { readonly kind: 'created'; readonly user: User } | { readonly kind: 'identity-taken' };
