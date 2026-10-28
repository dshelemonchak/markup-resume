import { TestBed } from '@angular/core/testing';
import type { CvListItem } from '../cv-list-item';
import { DocumentHeader } from './document-header';
import type { PreviewMode } from '../preview-mode';

const CV: CvListItem = {
  id: 'senior-angular',
  title: 'Senior Angular',
  subtitle: '',
  status: 'warning',
  pinned: false,
};

async function render(cv: CvListItem | null, mode: PreviewMode = 'visual') {
  const fixture = TestBed.createComponent(DocumentHeader);
  fixture.componentRef.setInput('cv', cv);
  fixture.componentRef.setInput('mode', mode);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('DocumentHeader', () => {
  it('shows the selected CV title, file and status', async () => {
    const { root } = await render(CV);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Senior Angular');
    expect(root.querySelector('.file')?.textContent).toBe('senior-angular.html');
    expect(root.querySelector('.badge')?.textContent?.trim()).toBe('Warnings');
    expect(root.querySelector('header[mr-glass-panel]')).not.toBeNull();
  });

  it('shows a placeholder when no CV is selected', async () => {
    const { root } = await render(null);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('No CV selected');
    expect(root.querySelector('.badge')).toBeNull();
  });

  it('switches the preview mode', async () => {
    const { fixture, root } = await render(CV);
    root.querySelector<HTMLInputElement>('#preview-mode-ats')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.mode()).toBe('ats');
  });

  it('locks the page width to A4 in ATS mode', async () => {
    const visual = (await render(CV, 'visual')).root;
    expect(visual.querySelector<HTMLInputElement>('#page-width')!.disabled).toBe(false);
    expect(visual.querySelector('[aria-label="Page width"]')).not.toBeNull();

    const ats = (await render(CV, 'ats')).root;
    expect(ats.querySelector<HTMLInputElement>('#page-width')!.disabled).toBe(true);
    expect(ats.querySelector('[aria-label="A4 in ATS"]')).not.toBeNull();
    expect(ats.querySelector<HTMLInputElement>('#preview-mode-ats')!.checked).toBe(true);
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
