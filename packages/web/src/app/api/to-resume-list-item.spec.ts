import { toResumeListItem } from './to-resume-list-item';

describe('toResumeListItem', () => {
  it('maps a server summary to a sidebar item', () => {
    const item = toResumeListItem(
      { slug: 'sample', title: 'Sample CV', updatedAt: '2026-10-27T19:56:58.595Z' },
      'en-GB',
    );
    expect(item).toEqual(
      expect.objectContaining({ slug: 'sample', title: 'Sample CV', status: 'not-exported', pinned: false }),
    );
    expect(item.subtitle.startsWith('sample · 27 Oct')).toBe(true);
  });
});
