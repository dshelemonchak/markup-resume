import { TestBed } from '@angular/core/testing';
import { ExportReport } from './export-report';

describe('ExportReport', () => {
  // jsdom has no modal dialogs.
  beforeAll(() => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.open = true;
      },
      close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
  });

  async function render(problems: string[], failure: string | null = null) {
    const fixture = TestBed.createComponent(ExportReport);
    fixture.componentRef.setInput('problems', problems);
    fixture.componentRef.setInput('failure', failure);
    await fixture.whenStable();
    fixture.componentInstance.open();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, dialog: root.querySelector('dialog')! };
  }

  it('lists the problems and still offers the PDF', async () => {
    const { fixture, root, dialog } = await render(['Words are split.', 'Order is off.']);
    expect([...root.querySelectorAll('.problems li')].map((li) => li.textContent)).toEqual([
      'Words are split.',
      'Order is off.',
    ]);
    let wanted = 0;
    fixture.componentInstance.downloadAnyway.subscribe(() => wanted++);
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Download anyway'))!
      .click();
    expect(wanted).toBe(1);
    expect(dialog.open).toBe(false);
  });

  it('says when the export failed, with nothing to download', async () => {
    const { root } = await render([], 'Http failure response: 502');
    expect(root.querySelector('.title')!.textContent).toContain('The export failed');
    expect(root.querySelector('.failure')!.textContent).toContain('502');
    expect(root.textContent).not.toContain('Download anyway');
  });
});
