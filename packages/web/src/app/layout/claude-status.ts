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

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * t(claude.connect, claude.sessions, claude.connected, claude.connectedLastUsed, claude.client.claudeAi,
 * claude.client.claudeCode, timeAgo.justNow, timeAgo.minutes, timeAgo.hours, timeAgo.days)
 */

/** Names of the Claude apps by the client name they send in the MCP handshake. */
const CLIENT_NAMES: Readonly<Record<string, string>> = {
  'claude-ai': 'claude.client.claudeAi',
  'claude-code': 'claude.client.claudeCode',
};

/** The app's name for a known client, or the client's own name. */
export const clientName = (client: string, t: Translate): string => {
  const key = CLIENT_NAMES[client];
  return key ? t(key) : client;
};

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now: Date, t: Translate): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t('timeAgo.justNow');
  if (minutes < 60) return t('timeAgo.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeAgo.hours', { count: hours });
  return t('timeAgo.days', { count: Math.floor(hours / 24) });
}

export function claudeSessionLines(
  sessions: readonly ClaudeSessionDto[],
  now: Date,
  t: Translate,
): ClaudeSessionLine[] {
  return sessions.map((session) => ({
    id: session.id,
    name: clientName(session.client, t),
    lastUsed: session.lastActivityAt ? timeAgo(session.lastActivityAt, now, t) : null,
  }));
}

export function claudeStatus(sessions: readonly ClaudeSessionDto[], now: Date, t: Translate): ClaudeStatus {
  const [first] = sessions;
  if (!first) {
    const connect = t('claude.connect');
    return { connected: false, label: connect, description: connect, lastUsed: null };
  }
  const label =
    sessions.length === 1 ? clientName(first.client, t) : t('claude.sessions', { count: sessions.length });
  const latest = sessions
    .map((session) => session.lastActivityAt)
    .filter((time): time is string => time !== null)
    .sort()
    .at(-1);
  const lastUsed = latest ? timeAgo(latest, now, t) : null;
  const description = lastUsed
    ? t('claude.connectedLastUsed', { label, lastUsed })
    : t('claude.connected', { label });
  return { connected: true, label, description, lastUsed };
}
