import { TestBed } from '@angular/core/testing';
import type { ResumeListItem } from '../resume-list-item';
import { DocumentHeader } from './document-header';
import type { PreviewMode } from '../preview-mode';

const CV: ResumeListItem = {
  slug: 'senior-angular',
  title: 'Senior Angular',
  subtitle: '',
  status: 'warning',
  pinned: false,
};

async function render(resume: ResumeListItem | null, mode: PreviewMode = 'visual') {
  const fixture = TestBed.createComponent(DocumentHeader);
  fixture.componentRef.setInput('resume', resume);
  fixture.componentRef.setInput('mode', mode);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('DocumentHeader', () => {
  it('names the selected CV, and shows its file and status', async () => {
    const { root } = await render(CV);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Senior Angular');
    expect(root.querySelector('.showing')?.textContent?.trim()).toBe('Showing senior-angular.html');
    expect(root.querySelector('.chip.warning')?.textContent?.trim()).toBe('Warnings');
    expect(root.querySelector('header[mr-glass-panel]')).not.toBeNull();
  });

  it('shows a placeholder when no CV is selected', async () => {
    const { root } = await render(null);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('No CV selected');
    expect(root.querySelector('.chip')).toBeNull();
  });

  it('switches the preview mode', async () => {
    const { fixture, root } = await render(CV);
    root.querySelector<HTMLInputElement>('#preview-mode-ats')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.mode()).toBe('ats');
  });

  it('marks the current mode in the View group', async () => {
    const { root } = await render(CV, 'ats');
    expect(root.querySelector('[role="group"][aria-label="View"]')).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>('#preview-mode-ats')!.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('#preview-mode-visual')!.checked).toBe(false);
  });

  it('asks for an export, and waits while one runs', async () => {
    const { fixture, root } = await render(CV);
    let asked = 0;
    fixture.componentInstance.exportPdf.subscribe(() => asked++);
    const button = () => root.querySelector<HTMLButtonElement>('.export')!;
    button().click();
    expect(asked).toBe(1);

    fixture.componentRef.setInput('exporting', true);
    await fixture.whenStable();
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Exporting');
  });

  it('cannot export without a selected CV', async () => {
    const { root } = await render(null);
    expect(root.querySelector<HTMLButtonElement>('.export')!.disabled).toBe(true);
  });
});
