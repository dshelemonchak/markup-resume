import { TestBed } from '@angular/core/testing';
import type { CvListItem } from '../cv-list-item';
import { Sidebar } from './sidebar';

const ITEMS: readonly CvListItem[] = [
  { id: 'a', title: 'Pinned one', subtitle: 'a', status: 'valid', pinned: true },
  { id: 'b', title: 'Other one', subtitle: 'b', status: 'valid', pinned: false },
  { id: 'c', title: 'Other two', subtitle: 'c', status: 'not-exported', pinned: false },
];

async function render(items: readonly CvListItem[], selectedId: string | null = null) {
  const fixture = TestBed.createComponent(Sidebar);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('selectedId', selectedId);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

const titles = (root: HTMLElement, groupId: string) =>
  [...root.querySelectorAll(`[aria-labelledby="${groupId}"] .title`)].map((el) => el.textContent);

describe('Sidebar', () => {
  it('renders as a glass aside', async () => {
    const { root } = await render(ITEMS);
    expect(root.querySelector('aside[cvc-glass-panel]')).not.toBeNull();
  });

  it('splits CVs into pinned and all others', async () => {
    const { root } = await render(ITEMS);
    expect(titles(root, 'sidebar-pinned')).toEqual(['Pinned one']);
    expect(titles(root, 'sidebar-all')).toEqual(['Other one', 'Other two']);
  });

  it('says why the list is empty', async () => {
    const { fixture, root } = await render([]);
    const empty = () => root.querySelector('.empty')!.textContent.trim();
    expect(empty()).toBe('No CVs yet');
    for (const [state, text] of [
      ['loading', 'Loading…'],
      ['unreachable', 'Server not reachable'],
    ] as const) {
      fixture.componentRef.setInput('listState', state);
      await fixture.whenStable();
      expect(empty()).toBe(text);
    }
  });

  it('hides the pinned group when nothing is pinned', async () => {
    const { root } = await render(ITEMS.filter((item) => !item.pinned));
    expect(root.querySelector('[aria-labelledby="sidebar-pinned"]')).toBeNull();
  });

  it('marks the selected CV and re-emits selection', async () => {
    const { fixture, root } = await render(ITEMS, 'b');
    expect(root.querySelector('[aria-current="true"] .title')?.textContent).toBe('Other one');

    const emitted: string[] = [];
    fixture.componentInstance.selectCv.subscribe((id) => emitted.push(id));
    root.querySelectorAll<HTMLButtonElement>('cvc-sidebar-item button')[2]!.click();
    expect(emitted).toEqual(['c']);
  });

  it('asks to show how to connect Claude', async () => {
    const { fixture, root } = await render(ITEMS);
    let asked = 0;
    fixture.componentInstance.connectClaude.subscribe(() => asked++);
    root.querySelector<HTMLButtonElement>('.connection')!.click();
    expect(asked).toBe(1);
  });

  it("shows Claude's connection status", async () => {
    const { fixture, root } = await render(ITEMS);
    const button = () => root.querySelector('.connection')!;
    expect(button().textContent).toContain('Connect Claude');
    expect(button().querySelector('.dot.on')).toBeNull();

    fixture.componentRef.setInput('claude', {
      connected: true,
      label: 'Claude Desktop',
      description: 'Claude Desktop connected, last used 2 min ago',
      lastUsed: '2 min ago',
    });
    await fixture.whenStable();
    expect(button().textContent).toContain('Claude Desktop');
    expect(button().getAttribute('aria-label')).toBe('Claude Desktop connected, last used 2 min ago');
    expect(button().textContent).toContain('2 min ago');
    expect(button().querySelector('.dot.on')).not.toBeNull();
  });
});
