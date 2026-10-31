import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { RibbonGroup } from '../../ui/ribbon-group/ribbon-group';
import type { ResumeListItem, ResumeListItemStatus } from '../resume-list-item';
import type { PreviewMode } from '../preview-mode';

/**
 * The badge of each status: its translation key and colour.
 * t(header.status.valid, header.status.warning, header.status.notExported)
 */
const STATUS_BADGE: Record<ResumeListItemStatus, { readonly key: string; readonly css: string }> = {
  valid: { key: 'header.status.valid', css: 'text-bg-success' },
  warning: { key: 'header.status.warning', css: 'text-bg-warning' },
  'not-exported': { key: 'header.status.notExported', css: 'text-bg-secondary' },
};

/**
 * Top bar of the workspace: the selected CV's title row and the settings ribbon.
 * Working now: the title row, Export PDF and the Visual / ATS switch. The Claude notice, page width,
 * font and revisions are placeholders.
 */
@Component({
  selector: 'mr-document-header',
  imports: [DummyMark, GlassPanel, RibbonGroup, TranslocoPipe],
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
  protected readonly isAts = computed(() => this.mode() === 'ats');
}
