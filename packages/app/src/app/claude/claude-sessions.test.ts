import { describe, expect, it, vi } from 'vitest';
import { ClaudeSessions } from './claude-sessions.ts';

function setup() {
  let time = Date.parse('2026-10-28T10:00:00.000Z');
  const sessions = new ClaudeSessions(() => new Date(time));
  const changed = vi.fn();
  sessions.onChange(changed);
  return { sessions, changed, advance: (ms: number) => (time += ms) };
}

describe('ClaudeSessions', () => {
  it('holds a session from connect to disconnect', () => {
    const { sessions, changed } = setup();
    const disconnect = sessions.connect('a', 'claude-ai', '1.0');
    expect(sessions.list()).toEqual([
      {
        id: 'a',
        client: 'claude-ai',
        version: '1.0',
        connectedAt: '2026-10-28T10:00:00.000Z',
        lastActivityAt: null,
      },
    ]);
    disconnect();
    expect(sessions.list()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('records tool calls of known sessions only', () => {
    const { sessions, advance } = setup();
    sessions.connect('a', 'claude-code', null);
    advance(60_000);
    expect(sessions.touch('a')).toBe(true);
    expect(sessions.touch('missing')).toBe(false);
    expect(sessions.list()[0]!.lastActivityAt).toBe('2026-10-28T10:01:00.000Z');
  });

  it('keeps a reconnected session when the stale connection drops late', () => {
    const { sessions, advance } = setup();
    const stale = sessions.connect('a', 'claude-ai', null);
    sessions.touch('a');
    advance(5_000);
    sessions.connect('a', 'claude-ai', null);
    stale();
    expect(sessions.list()).toEqual([
      expect.objectContaining({ id: 'a', connectedAt: '2026-10-28T10:00:00.000Z' }),
    ]);
    expect(sessions.list()[0]!.lastActivityAt).not.toBeNull();
  });

  it('lists the oldest connection first', () => {
    const { sessions, advance } = setup();
    sessions.connect('later', 'claude-code', null);
    advance(-1_000);
    sessions.connect('earlier', 'claude-ai', null);
    expect(sessions.list().map((session) => session.id)).toEqual(['earlier', 'later']);
  });
});
