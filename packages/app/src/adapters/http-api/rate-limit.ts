import type { Context, MiddlewareHandler } from 'hono';

/** At most `limit` requests from one client in each window of `windowMs`. */
export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitOptions {
  /** Who is asking, e.g. the remote address. */
  readonly clientKey: (c: Context) => string;
  /** The current time in milliseconds; tests pass a fixed clock. */
  readonly now?: () => number;
}

/** Above this many clients counted at once, finished windows are dropped before a new one is added. */
const SWEEP_AT = 10_000;

/**
 * Counts requests per client in fixed windows, in this process's memory, and answers 429 with Retry-After above the
 * limit. Only right for one running instance: several would each count their own (ADR-0028, issue #33). The
 * answer is an OAuth-style error, as the endpoints it guards are the authorisation server's.
 */
export function rateLimit(rule: RateLimitRule, options: RateLimitOptions): MiddlewareHandler {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; endsAt: number }>();

  return async (c, next) => {
    const at = now();
    const key = options.clientKey(c);
    let window = windows.get(key);
    if (!window || window.endsAt <= at) {
      if (!window && windows.size >= SWEEP_AT) {
        for (const [client, counted] of windows) {
          if (counted.endsAt <= at) {
            windows.delete(client);
          }
        }
      }
      window = { count: 0, endsAt: at + rule.windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    if (window.count > rule.limit) {
      return c.json(
        { error: 'too_many_requests', error_description: 'Too many requests. Try again later.' },
        429,
        {
          'Retry-After': String(Math.ceil((window.endsAt - at) / 1000)),
          'Cache-Control': 'no-store',
        },
      );
    }
    return next();
  };
}
