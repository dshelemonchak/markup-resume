import type { ClaudeSessionDto } from '../../api/cv-api';
import { claudeSessionLines, claudeStatus, timeAgo } from './claude-status';

const NOW = new Date('2026-10-28T12:00:00.000Z');

const session = (id: string, client: string, lastActivityAt: string | null): ClaudeSessionDto => ({
  id,
  client,
  version: null,
  connectedAt: '2026-10-28T11:00:00.000Z',
  lastActivityAt,
});

describe('timeAgo', () => {
  it('rounds down to the largest unit', () => {
    expect(timeAgo('2026-10-28T11:59:30.000Z', NOW)).toBe('just now');
    expect(timeAgo('2026-10-28T11:55:00.000Z', NOW)).toBe('5 min ago');
    expect(timeAgo('2026-10-28T09:00:00.000Z', NOW)).toBe('3 h ago');
    expect(timeAgo('2026-10-26T12:00:00.000Z', NOW)).toBe('2 d ago');
  });
});

describe('claudeStatus', () => {
  it('invites to connect when no Claude is connected', () => {
    expect(claudeStatus([], NOW)).toEqual({
      connected: false,
      label: 'Connect Claude',
      description: 'Connect Claude',
      lastUsed: null,
    });
  });

  it('names a single client, with its last tool call', () => {
    expect(claudeStatus([session('a', 'claude-ai', '2026-10-28T11:58:00.000Z')], NOW)).toEqual({
      connected: true,
      label: 'Claude Desktop',
      description: 'Claude Desktop connected, last used 2 min ago',
      lastUsed: '2 min ago',
    });
    expect(claudeStatus([session('a', 'claude-code', null)], NOW)).toMatchObject({
      description: 'Claude Code connected',
      lastUsed: null,
    });
  });

  it('counts several sessions and takes the latest tool call', () => {
    const status = claudeStatus(
      [
        session('a', 'claude-ai', '2026-10-28T11:30:00.000Z'),
        session('b', 'claude-code', '2026-10-28T11:50:00.000Z'),
        session('c', 'claude-code', null),
      ],
      NOW,
    );
    expect(status).toEqual({
      connected: true,
      label: '3 Claude sessions',
      description: '3 Claude sessions connected, last used 10 min ago',
      lastUsed: '10 min ago',
    });
  });
});

describe('claudeSessionLines', () => {
  it('names known clients and keeps unknown ones as they are', () => {
    expect(
      claudeSessionLines([session('a', 'claude-code', null), session('b', 'other-client', null)], NOW),
    ).toEqual([
      { id: 'a', name: 'Claude Code', lastUsed: null },
      { id: 'b', name: 'other-client', lastUsed: null },
    ]);
  });
});
