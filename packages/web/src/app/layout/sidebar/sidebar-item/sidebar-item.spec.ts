import { TestBed } from '@angular/core/testing';
import type { CvListItem } from '../cv-list-item';
import { SidebarItem } from './sidebar-item';

const ITEM: CvListItem = {
  id: 'cv-1',
  title: 'Title',
  subtitle: 'cv-1 · edited',
  status: 'warning',
  pinned: true,
};

async function render(selected: boolean) {
  const fixture = TestBed.createComponent(SidebarItem);
  fixture.componentRef.setInput('item', ITEM);
  fixture.componentRef.setInput('selected', selected);
  await fixture.whenStable();
  return { fixture, button: (fixture.nativeElement as HTMLElement).querySelector('button')! };
}

describe('SidebarItem', () => {
  it('shows title, subtitle, status and the pin', async () => {
    const { button } = await render(false);
    expect(button.querySelector('.title')?.textContent).toBe('Title');
    expect(button.querySelector('.subtitle')?.textContent).toBe('cv-1 · edited');
    expect(button.querySelector('.status')?.classList.contains('warning')).toBe(true);
    expect(button.querySelector('[aria-label="Pinned"]')).not.toBeNull();
  });

  it('marks the selected item for assistive technology', async () => {
    expect((await render(true)).button.getAttribute('aria-current')).toBe('true');
    expect((await render(false)).button.hasAttribute('aria-current')).toBe(false);
  });

  it('emits its id when clicked', async () => {
    const { fixture, button } = await render(false);
    const emitted: string[] = [];
    fixture.componentInstance.selectCv.subscribe((id) => emitted.push(id));
    button.click();
    expect(emitted).toEqual(['cv-1']);
  });
});
