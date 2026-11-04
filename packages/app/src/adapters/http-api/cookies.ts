import type { MiddlewareHandler } from 'hono';

/**
 * The session cookie (ADR-0027). __Host-: only this host, only over HTTPS (browsers treat http://localhost as
 * secure), path /. HttpOnly keeps it from scripts; SameSite=Lax keeps it off requests that other sites start,
 * except a top-level navigation such as GitHub's redirect back.
 */
export const SESSION_COOKIE = '__Host-session';
export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

/** A request that changes state must come from the app's own pages: the CSRF check on top of SameSite. */
export function sameOrigin(appOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('Origin') !== appOrigin) {
      return c.json({ error: 'forbidden-origin' }, 403);
    }
    return next();
  };
}
