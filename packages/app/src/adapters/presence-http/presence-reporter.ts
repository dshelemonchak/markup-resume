import { setTimeout as sleep } from 'node:timers/promises';

/** Waits between reconnects while the app is down; the last one repeats. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

export interface PresenceReporterOptions {
  /** Base URL of the Markup Résumé app, e.g. http://app:3000. */
  readonly appUrl: string;
  readonly sessionId: string;
  readonly client: string;
  readonly version: string | null;
  readonly retryDelaysMs?: readonly number[];
}

export interface PresenceReporter {
  /** Reports a tool call; dropped quietly if the app is not reachable. */
  activity(): void;
  /** Closes the presence connection and stops reconnecting. */
  stop(): void;
}

/**
 * Tells the Markup Résumé app that Claude is connected (ADR-0018) by holding its presence request open:
 * the app drops the session as soon as the connection closes, so a crashed or killed MCP server
 * leaves nothing behind. While the app is down or restarting, it reconnects with a growing delay;
 * the MCP server works the same either way.
 */
export function reportPresence(options: PresenceReporterOptions): PresenceReporter {
  const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const stopped = new AbortController();
  const session = `${options.appUrl}/api/v1/claude/sessions/${encodeURIComponent(options.sessionId)}`;
  const query = new URLSearchParams({ client: options.client });
  if (options.version) query.set('version', options.version);

  const holdPresence = async () => {
    let attempt = 0;
    while (!stopped.signal.aborted) {
      try {
        const response = await fetch(`${session}/presence?${query.toString()}`, { signal: stopped.signal });
        if (response.ok && response.body) {
          attempt = 0;
          // Only the connection matters; the app's pings are read and dropped until it ends.
          const reader = response.body.getReader();
          while (!(await reader.read()).done);
        }
      } catch {
        // App not reachable or connection lost: retry below.
      }
      try {
        await sleep(delays[Math.min(attempt++, delays.length - 1)], undefined, { signal: stopped.signal });
      } catch {
        return;
      }
    }
  };
  void holdPresence();

  return {
    activity: () => {
      fetch(`${session}/activity`, { method: 'POST', signal: stopped.signal }).catch(() => {});
    },
    stop: () => stopped.abort(),
  };
}
