import type { NewSession, Session, SessionRepository, User } from '../../domain/index.ts';

interface MemorySession {
  readonly id: string;
  readonly user: User;
  readonly expiresAt: Date;
  lastSeenAt: Date;
}

/**
 * SessionRepository in memory, for tests of the use cases and adapters: the same expiry rules as
 * PostgresSessionRepository, which has its own tests against Postgres. A session starts as last seen at its
 * creation time, which the test gives through `createdAt`, as Postgres takes now() for it.
 */
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, MemorySession>();
  private nextId = 1;
  readonly touched: string[] = [];

  private readonly userById: (id: string) => User;
  private readonly createdAt: () => Date;

  constructor(userById: (id: string) => User, createdAt: () => Date) {
    this.userById = userById;
    this.createdAt = createdAt;
  }

  create(session: NewSession): Promise<void> {
    this.sessions.set(hex(session.tokenHash), {
      id: `session-${this.nextId++}`,
      user: this.userById(session.userId),
      expiresAt: session.expiresAt,
      lastSeenAt: this.createdAt(),
    });
    return Promise.resolve();
  }

  findActive(
    tokenHash: Uint8Array,
    at: { readonly now: Date; readonly idleSince: Date },
  ): Promise<Session | null> {
    const session = this.sessions.get(hex(tokenHash));
    if (!session || session.expiresAt <= at.now || session.lastSeenAt < at.idleSince) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ id: session.id, user: session.user, lastSeenAt: session.lastSeenAt });
  }

  touch(id: string, at: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === id) {
        session.lastSeenAt = at;
        this.touched.push(id);
      }
    }
    return Promise.resolve();
  }

  delete(tokenHash: Uint8Array): Promise<void> {
    this.sessions.delete(hex(tokenHash));
    return Promise.resolve();
  }

  get size(): number {
    return this.sessions.size;
  }
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
