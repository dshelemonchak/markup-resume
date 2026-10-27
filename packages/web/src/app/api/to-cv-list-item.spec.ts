import { toCvListItem } from './to-cv-list-item';

describe('toCvListItem', () => {
  it('maps a server summary to a sidebar item', () => {
    const item = toCvListItem({ id: 'sample', title: 'Sample CV', updatedAt: '2026-10-27T19:56:58.595Z' });
    expect(item).toEqual(
      expect.objectContaining({ id: 'sample', title: 'Sample CV', status: 'not-exported', pinned: false }),
    );
    expect(item.subtitle.startsWith('sample · 27 Oct')).toBe(true);
  });
});
