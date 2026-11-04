import type {
  AccessGrant,
  AuthorizationCode,
  ConsumeCodeResult,
  NewAuthorizationCode,
  NewTokenFamily,
  NewTokens,
  OAuthClient,
  OAuthClientRepository,
  OAuthGrantRepository,
  RotateRefreshTokenResult,
} from '../../domain/index.ts';

/** OAuthClientRepository in memory, for tests; PostgresOAuthClientRepository has its own tests against Postgres. */
export class InMemoryOAuthClientRepository implements OAuthClientRepository {
  private readonly clients = new Map<string, OAuthClient>();
  private nextId = 1;

  register(client: Omit<OAuthClient, 'id'>): Promise<OAuthClient> {
    const registered = { id: `client-row-${this.nextId++}`, ...client };
    this.clients.set(client.clientId, registered);
    return Promise.resolve(registered);
  }

  findByClientId(clientId: string): Promise<OAuthClient | null> {
    return Promise.resolve(this.clients.get(clientId) ?? null);
  }

  /** The public id of a client row, as the access grant reports it. */
  publicId(rowId: string): string {
    const client = [...this.clients.values()].find((candidate) => candidate.id === rowId);
    if (!client) {
      throw new Error(`No client ${rowId}`);
    }
    return client.clientId;
  }
}

interface MemoryCode extends AuthorizationCode {
  usedAt: Date | null;
}

interface MemoryFamily extends NewTokenFamily {
  readonly id: string;
  revokedAt: Date | null;
}

interface MemoryToken {
  readonly familyId: string;
  readonly expiresAt: Date;
  usedAt: Date | null;
}

/**
 * OAuthGrantRepository in memory, with the same once-only rules as PostgresOAuthGrantRepository, which has its own
 * tests against Postgres (including the races).
 */
export class InMemoryOAuthGrantRepository implements OAuthGrantRepository {
  private readonly codes = new Map<string, MemoryCode>();
  private readonly families = new Map<string, MemoryFamily>();
  private readonly accessTokens = new Map<string, MemoryToken>();
  private readonly refreshTokens = new Map<string, MemoryToken>();
  private nextId = 1;
  private readonly clients: InMemoryOAuthClientRepository;

  constructor(clients: InMemoryOAuthClientRepository) {
    this.clients = clients;
  }

  createCode(code: NewAuthorizationCode): Promise<void> {
    const { codeHash, ...rest } = code;
    this.codes.set(hex(codeHash), { ...rest, id: `code-${this.nextId++}`, usedAt: null });
    return Promise.resolve();
  }

  consumeCode(codeHash: Uint8Array, now: Date): Promise<ConsumeCodeResult> {
    const code = this.codes.get(hex(codeHash));
    if (!code) {
      return Promise.resolve({ kind: 'not-found' });
    }
    if (code.usedAt !== null) {
      return Promise.resolve({ kind: 'reused', codeId: code.id });
    }
    code.usedAt = now;
    return Promise.resolve({
      kind: 'consumed',
      code: {
        id: code.id,
        clientId: code.clientId,
        userId: code.userId,
        redirectUri: code.redirectUri,
        codeChallenge: code.codeChallenge,
        resource: code.resource,
        expiresAt: code.expiresAt,
      },
    });
  }

  revokeFamilyOfCode(codeId: string, now: Date): Promise<void> {
    for (const family of this.families.values()) {
      if (family.authorizationCodeId === codeId && family.revokedAt === null) {
        family.revokedAt = now;
      }
    }
    return Promise.resolve();
  }

  createFamily(family: NewTokenFamily, tokens: NewTokens): Promise<void> {
    const id = `family-${this.nextId++}`;
    this.families.set(id, { ...family, id, revokedAt: null });
    this.addTokens(id, tokens);
    return Promise.resolve();
  }

  findAccessToken(tokenHash: Uint8Array, now: Date): Promise<AccessGrant | null> {
    const token = this.accessTokens.get(hex(tokenHash));
    const family = token ? this.families.get(token.familyId) : undefined;
    if (!token || !family || token.expiresAt <= now || family.revokedAt !== null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      userId: family.userId,
      clientId: this.clients.publicId(family.clientId),
      resource: family.resource,
      expiresAt: token.expiresAt,
    });
  }

  rotateRefreshToken(
    tokenHash: Uint8Array,
    client: { readonly id: string },
    now: Date,
    next: NewTokens,
  ): Promise<RotateRefreshTokenResult> {
    const token = this.refreshTokens.get(hex(tokenHash));
    const family = token ? this.families.get(token.familyId) : undefined;
    if (
      !token ||
      !family ||
      family.revokedAt !== null ||
      token.expiresAt <= now ||
      family.clientId !== client.id
    ) {
      return Promise.resolve({ kind: 'invalid' });
    }
    if (token.usedAt !== null) {
      family.revokedAt = now;
      return Promise.resolve({ kind: 'reused' });
    }
    token.usedAt = now;
    this.addTokens(family.id, next);
    return Promise.resolve({ kind: 'rotated' });
  }

  private addTokens(familyId: string, tokens: NewTokens): void {
    this.accessTokens.set(hex(tokens.accessTokenHash), {
      familyId,
      expiresAt: tokens.accessTokenExpiresAt,
      usedAt: null,
    });
    this.refreshTokens.set(hex(tokens.refreshTokenHash), {
      familyId,
      expiresAt: tokens.refreshTokenExpiresAt,
      usedAt: null,
    });
  }
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
