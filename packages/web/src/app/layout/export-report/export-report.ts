import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { PdfProblemDto } from '../../api/resume-api';
import { injectTranslate } from '../../i18n/i18n';
import { pdfProblemLines } from '../pdf-problem-text';

/**
 * What went wrong when the CV was exported, in a native modal <dialog>: either the PDF check's problems
 * (ADR-0009), for which the PDF is held back but can still be taken, or the export failing altogether.
 */
@Component({
  selector: 'mr-export-report',
  imports: [TranslocoPipe],
  templateUrl: './export-report.html',
  styleUrl: './export-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportReport {
  readonly problems = input<readonly PdfProblemDto[]>([]);
  /** Set when there is no PDF at all: the export itself failed. */
  readonly failure = input<string | null>(null);
  /** The user wants the PDF despite the problems. */
  readonly downloadAnyway = output();

  private readonly translate = injectTranslate();
  protected readonly lines = computed(() => pdfProblemLines(this.problems(), this.translate));

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
