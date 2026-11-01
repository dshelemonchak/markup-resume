import { toResumeListItem } from './to-resume-list-item';

describe('toResumeListItem', () => {
  it.each([false, true])('maps a server summary with pinned=%s to a sidebar item', (pinned) => {
    const item = toResumeListItem(
      { slug: 'sample', title: 'Sample CV', updatedAt: '2026-10-27T19:56:58.595Z', pinned },
      'en-GB',
    );
    expect(item).toEqual(
      expect.objectContaining({ slug: 'sample', title: 'Sample CV', status: 'not-exported', pinned }),
    );
    expect(item.subtitle.startsWith('sample · 27 Oct')).toBe(true);
  });
});
