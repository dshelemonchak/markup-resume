/** A Claude client connected to cv-kit's MCP server, as the server reports it (ADR-0018). */
export interface ClaudeSession {
  readonly id: string;
  /** clientInfo.name from the MCP handshake, e.g. "claude-ai" (Claude Desktop) or "claude-code". */
  readonly client: string;
  readonly version: string | null;
  /** ISO 8601. */
  readonly connectedAt: string;
  /** ISO 8601; null until Claude calls a tool. */
  readonly lastActivityAt: string | null;
}

/**
 * The Claude sessions currently connected, held in memory: a session lives exactly as long as its
 * MCP server keeps the presence connection open, so nothing has to expire or be cleaned up.
 */
export class ClaudeSessions {
  private readonly sessions = new Map<string, { session: ClaudeSession; token: symbol }>();
  private readonly listeners = new Set<() => void>();

  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /**
   * Registers a session and returns its disconnect function. A reconnect with the same id replaces
   * the session, and the stale connection's late disconnect then leaves the new one alone.
   */
  connect(id: string, client: string, version: string | null): () => void {
    const token = Symbol(id);
    const previous = this.sessions.get(id)?.session;
    this.sessions.set(id, {
      token,
      session: {
        id,
        client,
        version,
        connectedAt: previous?.connectedAt ?? this.now().toISOString(),
        lastActivityAt: previous?.lastActivityAt ?? null,
      },
    });
    this.changed();
    return () => {
      if (this.sessions.get(id)?.token !== token) return;
      this.sessions.delete(id);
      this.changed();
    };
  }

  /** Records a tool call; false for an unknown session. */
  touch(id: string): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    entry.session = { ...entry.session, lastActivityAt: this.now().toISOString() };
    this.changed();
    return true;
  }

  /** Oldest connection first. */
  list(): readonly ClaudeSession[] {
    return [...this.sessions.values()]
      .map((entry) => entry.session)
      .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }
}
