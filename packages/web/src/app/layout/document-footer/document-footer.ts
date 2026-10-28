import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { ZoomControl } from '../../ui/zoom-control/zoom-control';
import type { ZoomSetting } from '../../ui/zoom';
import type { DocumentInfo } from '../document-info';
import type { PreviewMode } from '../preview-mode';

/**
 * Status bar of the workspace, under the document.
 * Working now: pages and font measured in the preview, and the zoom controls. The validation
 * summary, export time and the validation report are placeholders.
 */
@Component({
  selector: 'mr-document-footer',
  imports: [DummyMark, GlassPanel, ZoomControl],
  templateUrl: './document-footer.html',
  styleUrl: './document-footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentFooter {
  readonly info = input<DocumentInfo | null>(null);
  readonly mode = input<PreviewMode>('visual');
  readonly zoom = model<ZoomSetting>('fit');

  /** "2 pages · 210 mm" in visual mode, "2 pages · A4" in ATS (ATS output is always A4). */
  protected readonly pageInfo = computed(() => {
    const info = this.info();
    if (!info) return null;
    const pages = `${info.pages} ${info.pages === 1 ? 'page' : 'pages'}`;
    return `${pages} · ${this.mode() === 'ats' ? 'A4' : '210 mm'}`;
  });
  protected readonly scale = computed(() => this.info()?.scale ?? 1);
}
