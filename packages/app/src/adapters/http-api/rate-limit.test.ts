import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { rateLimit } from './rate-limit.ts';

function setup() {
  let now = 0;
  const app = new Hono();
  app.post(
    '/',
    rateLimit(
      { limit: 2, windowMs: 60_000 },
      { clientKey: (c) => c.req.header('X-Client') ?? 'none', now: () => now },
    ),
    (c) => c.text('ok'),
  );
  const call = (client: string) => app.request('/', { method: 'POST', headers: { 'X-Client': client } });
  return {
    call,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('rateLimit', () => {
  it('answers 429 with Retry-After above the limit, per client', async () => {
    const { call, advance } = setup();
    expect((await call('a')).status).toBe(200);
    expect((await call('a')).status).toBe(200);
    advance(15_000);
    const refused = await call('a');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('45');
    expect(await refused.json()).toMatchObject({ error: 'too_many_requests' });
    expect((await call('b')).status).toBe(200);
  });

  it('starts counting again when the window ends', async () => {
    const { call, advance } = setup();
    await call('a');
    await call('a');
    expect((await call('a')).status).toBe(429);
    advance(60_000);
    expect((await call('a')).status).toBe(200);
  });
});
