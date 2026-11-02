import type { CreateUserResult, ExternalIdentity, User, UserRepository } from '../../domain/index.ts';

/**
 * UserRepository in memory, for tests of the use cases and adapters: one user per identity, as the unique
 * constraint on user_identities keeps it in Postgres. PostgresUserRepository has its own tests against Postgres.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  private nextId = 1;

  findByIdentity(identity: Pick<ExternalIdentity, 'provider' | 'providerUserId'>): Promise<User | null> {
    return Promise.resolve(this.users.get(key(identity)) ?? null);
  }

  /** The user with this id, for fakes that need the whole user, as Postgres joins it. */
  byId(id: string): User {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      throw new Error(`No user ${id}`);
    }
    return user;
  }

  createWithIdentity(identity: ExternalIdentity): Promise<CreateUserResult> {
    if (this.users.has(key(identity))) {
      return Promise.resolve({ kind: 'identity-taken' });
    }
    const user = { id: `user-${this.nextId++}`, name: identity.name };
    this.users.set(key(identity), user);
    return Promise.resolve({ kind: 'created', user });
  }
}

function key(identity: Pick<ExternalIdentity, 'provider' | 'providerUserId'>): string {
  return `${identity.provider}:${identity.providerUserId}`;
}
