import { ChangeDetectionStrategy, Component, type ElementRef, input, output, viewChild } from '@angular/core';

/**
 * What went wrong when the CV was exported, in a native modal <dialog>: either the PDF check's problems
 * (ADR-0009), for which the PDF is held back but can still be taken, or the export failing altogether.
 */
@Component({
  selector: 'mr-export-report',
  templateUrl: './export-report.html',
  styleUrl: './export-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportReport {
  readonly problems = input<readonly string[]>([]);
  /** Set when there is no PDF at all: the export itself failed. */
  readonly failure = input<string | null>(null);
  /** The user wants the PDF despite the problems. */
  readonly downloadAnyway = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected download(): void {
    this.close();
    this.downloadAnyway.emit();
  }
}
