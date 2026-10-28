import type { ClaudeSessionDto } from '../api/cv-api';

/** One connected Claude, ready to show. */
export interface ClaudeSessionLine {
  readonly id: string;
  /** "Claude Desktop", "Claude Code", or the client's own name. */
  readonly name: string;
  /** "2 min ago"; null until Claude calls a tool. */
  readonly lastUsed: string | null;
}

/**
 * The one-line status at the bottom of the sidebar. The sidebar is narrow, so the label is short
 * ("Claude Desktop" next to a green dot) and the full sentence goes to the accessible name.
 */
export interface ClaudeStatus {
  readonly connected: boolean;
  readonly label: string;
  /** "Claude Desktop connected, last used 2 min ago". */
  readonly description: string;
  /** When any connected Claude last called a tool. */
  readonly lastUsed: string | null;
}

const CLIENT_NAMES: Readonly<Record<string, string>> = {
  'claude-ai': 'Claude Desktop',
  'claude-code': 'Claude Code',
};

export const clientName = (client: string): string => CLIENT_NAMES[client] ?? client;

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function claudeSessionLines(sessions: readonly ClaudeSessionDto[], now: Date): ClaudeSessionLine[] {
  return sessions.map((session) => ({
    id: session.id,
    name: clientName(session.client),
    lastUsed: session.lastActivityAt ? timeAgo(session.lastActivityAt, now) : null,
  }));
}

export function claudeStatus(sessions: readonly ClaudeSessionDto[], now: Date): ClaudeStatus {
  const [first] = sessions;
  if (!first) {
    return { connected: false, label: 'Connect Claude', description: 'Connect Claude', lastUsed: null };
  }
  const label = sessions.length === 1 ? clientName(first.client) : `${sessions.length} Claude sessions`;
  const latest = sessions
    .map((session) => session.lastActivityAt)
    .filter((time): time is string => time !== null)
    .sort()
    .at(-1);
  const lastUsed = latest ? timeAgo(latest, now) : null;
  const description = `${label} connected${lastUsed ? `, last used ${lastUsed}` : ''}`;
  return { connected: true, label, description, lastUsed };
}
