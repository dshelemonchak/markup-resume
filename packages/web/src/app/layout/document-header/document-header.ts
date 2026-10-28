import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { RibbonGroup } from '../../ui/ribbon-group/ribbon-group';
import type { CvListItem, CvListItemStatus } from '../cv-list-item';
import type { PreviewMode } from '../preview-mode';

const STATUS_BADGE: Record<CvListItemStatus, { readonly text: string; readonly css: string }> = {
  valid: { text: 'Valid', css: 'text-bg-success' },
  warning: { text: 'Warnings', css: 'text-bg-warning' },
  'not-exported': { text: 'Not exported', css: 'text-bg-secondary' },
};

/**
 * Top bar of the workspace: the selected CV's title row and the settings ribbon.
 * Working now: the title row, Export PDF and the Visual / ATS switch. The Claude notice, page width,
 * font and revisions are placeholders.
 */
@Component({
  selector: 'mr-document-header',
  imports: [DummyMark, GlassPanel, RibbonGroup],
  templateUrl: './document-header.html',
  styleUrl: './document-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentHeader {
  readonly cv = input<CvListItem | null>(null);
  readonly mode = model<PreviewMode>('visual');
  /** An export is running: the button waits. */
  readonly exporting = input(false);
  readonly exportPdf = output();

  protected readonly badge = computed(() => {
    const cv = this.cv();
    return cv ? STATUS_BADGE[cv.status] : null;
  });
  protected readonly isAts = computed(() => this.mode() === 'ats');
}
