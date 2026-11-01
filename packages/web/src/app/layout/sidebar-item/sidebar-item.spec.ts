import { TestBed } from '@angular/core/testing';
import type { ResumeListItem } from '../resume-list-item';
import { SidebarItem } from './sidebar-item';

const ITEM: ResumeListItem = {
  slug: 'resume-1',
  title: 'Title',
  subtitle: 'resume-1 · edited',
  status: 'warning',
  pinned: true,
};

async function render(selected: boolean, pinned = ITEM.pinned) {
  const fixture = TestBed.createComponent(SidebarItem);
  fixture.componentRef.setInput('item', { ...ITEM, pinned });
  fixture.componentRef.setInput('selected', selected);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    button: root.querySelector<HTMLButtonElement>('.item-main')!,
    menu: root.querySelector<HTMLButtonElement>('.item-menu-btn')!,
  };
}

describe('SidebarItem', () => {
  it('shows title, subtitle, status and the pin', async () => {
    const { button } = await render(false);
    expect(button.querySelector('.title')?.textContent).toBe('Title');
    expect(button.querySelector('.subtitle')?.textContent).toBe('resume-1 · edited');
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
    fixture.componentInstance.selectResume.subscribe((id) => emitted.push(id));
    button.click();
    expect(emitted).toEqual(['resume-1']);
  });

  it('has a menu button beside the row, named after the CV, that does not select it', async () => {
    const { fixture, button, menu } = await render(false);
    expect(button.contains(menu)).toBe(false);
    expect(menu.getAttribute('aria-label')).toBe('Actions for Title');
    const emitted: string[] = [];
    fixture.componentInstance.selectResume.subscribe((id) => emitted.push(id));
    menu.click();
    expect(emitted).toEqual([]);
  });

  it.each([false, true])('requests a pin toggle without selecting the CV when pinned=%s', async (pinned) => {
    const { fixture, menu } = await render(false, pinned);
    const toggled = vi.fn();
    const selected = vi.fn();
    fixture.componentInstance.togglePinResume.subscribe(toggled);
    fixture.componentInstance.selectResume.subscribe(selected);

    menu.click();
    await fixture.whenStable();
    const action = document.body.querySelector<HTMLButtonElement>('.dropdown-menu.show button')!;
    expect(action.textContent.trim()).toBe(pinned ? 'Unpin' : 'Pin');
    action.click();
    await fixture.whenStable();

    expect(toggled).toHaveBeenCalledOnce();
    expect(selected).not.toHaveBeenCalled();
  });
});
