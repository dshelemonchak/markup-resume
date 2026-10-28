import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { RibbonGroup } from '../../ui/ribbon-group/ribbon-group';
import type { CvListItem, CvListItemStatus } from '../sidebar/cv-list-item';
import type { PreviewMode } from './preview-mode';

const STATUS_BADGE: Record<CvListItemStatus, { readonly text: string; readonly css: string }> = {
  valid: { text: 'Valid', css: 'text-bg-success' },
  warning: { text: 'Warnings', css: 'text-bg-warning' },
  'not-exported': { text: 'Not exported', css: 'text-bg-secondary' },
};

/**
 * Top bar of the workspace: the selected CV's title row and the settings ribbon.
 * Working now: the title row and the Visual / ATS switch. The Claude notice, Export PDF,
 * page width, font and revisions are placeholders.
 */
@Component({
  selector: 'cvc-document-header',
  imports: [DummyMark, GlassPanel, RibbonGroup],
  templateUrl: './document-header.html',
  styleUrl: './document-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentHeader {
  readonly cv = input<CvListItem | null>(null);
  readonly mode = model<PreviewMode>('visual');

  protected readonly badge = computed(() => {
    const cv = this.cv();
    return cv ? STATUS_BADGE[cv.status] : null;
  });
  protected readonly isAts = computed(() => this.mode() === 'ats');
}
