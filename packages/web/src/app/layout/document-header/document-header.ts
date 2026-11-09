import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import type { ResumeListItem, ResumeListItemStatus } from '../resume-list-item';
import type { PreviewMode } from '../preview-mode';

/**
 * The badge of each status: its translation key and colour.
 * t(header.status.valid, header.status.warning, header.status.notExported)
 */
const STATUS_BADGE: Record<ResumeListItemStatus, { readonly key: string; readonly css: string }> = {
  valid: { key: 'header.status.valid', css: 'success' },
  warning: { key: 'header.status.warning', css: 'warning' },
  'not-exported': { key: 'header.status.notExported', css: 'neutral' },
};

/**
 * Toolbar of the CV editor, one row: the Visual / ATS switch, the selected CV's status and file, and Export PDF.
 */
@Component({
  selector: 'mr-document-header',
  imports: [GlassPanel, TranslocoPipe],
  templateUrl: './document-header.html',
  styleUrl: './document-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentHeader {
  readonly resume = input<ResumeListItem | null>(null);
  readonly mode = model<PreviewMode>('visual');
  /** An export is running: the button waits. */
  readonly exporting = input(false);
  readonly exportPdf = output();

  protected readonly badge = computed(() => {
    const resume = this.resume();
    return resume ? STATUS_BADGE[resume.status] : null;
  });
}
