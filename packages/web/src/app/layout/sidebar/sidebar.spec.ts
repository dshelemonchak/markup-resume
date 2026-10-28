import { TestBed } from '@angular/core/testing';
import type { CvListItem } from './cv-list-item';
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
});
