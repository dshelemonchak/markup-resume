import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { CvApi } from '../../api/cv-api';
import { toCvListItem } from '../../api/to-cv-list-item';
import { DocumentCanvas } from '../../layout/document-canvas/document-canvas';
import { DocumentHeader } from '../../layout/document-header/document-header';
import type { PreviewMode } from '../../layout/document-header/preview-mode';
import { Sidebar } from '../../layout/sidebar/sidebar';

/** Main screen: CVs from the local server on the left; top bar and the selected CV on the right. */
@Component({
  selector: 'cvc-workspace',
  imports: [DocumentCanvas, DocumentHeader, Sidebar],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Workspace {
  private readonly api = inject(CvApi);

  protected readonly cvs = computed(() => (this.api.cvs.value() ?? []).map(toCvListItem));
  protected readonly loadError = computed(() => this.api.cvs.error() !== undefined);

  /** Keeps the user's choice while it still exists after a reload; otherwise the first CV. */
  protected readonly selectedId = linkedSignal<readonly { id: string }[], string | null>({
    source: this.cvs,
    computation: (cvs, previous) =>
      previous && cvs.some((cv) => cv.id === previous.value) ? previous.value : (cvs[0]?.id ?? null),
  });
  protected readonly selectedCv = computed(
    () => this.cvs().find((cv) => cv.id === this.selectedId()) ?? null,
  );
  protected readonly documentSrc = computed(() => {
    const id = this.selectedId();
    return id ? this.api.documentUrl(id, this.api.revision()) : null;
  });

  protected readonly mode = signal<PreviewMode>('visual');
}
