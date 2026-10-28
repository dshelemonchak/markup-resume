import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { CvApi } from '../../api/cv-api';
import { toCvListItem } from '../../api/to-cv-list-item';
import { claudeSessionLines, claudeStatus } from '../../layout/claude-status';
import { ConnectClaude } from '../../layout/connect-claude/connect-claude';
import { DocumentCanvas } from '../../layout/document-canvas/document-canvas';
import type { DocumentInfo } from '../../layout/document-info';
import { DocumentFooter } from '../../layout/document-footer/document-footer';
import { DocumentHeader } from '../../layout/document-header/document-header';
import { ExportReport } from '../../layout/export-report/export-report';
import type { PreviewMode } from '../../layout/preview-mode';
import type { CvListState } from '../../layout/cv-list-item';
import { Sidebar } from '../../layout/sidebar/sidebar';
import { PinchZoom } from '../../ui/pinch-zoom/pinch-zoom';
import type { ZoomSetting } from '../../ui/zoom';

/** Main screen: CVs from the local server on the left; top bar, the selected CV and the status bar on the right. */
@Component({
  selector: 'mr-workspace',
  imports: [ConnectClaude, DocumentCanvas, DocumentFooter, DocumentHeader, ExportReport, PinchZoom, Sidebar],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Workspace {
  private readonly api = inject(CvApi);

  // value() throws while a resource is in its error state (server down), so read it only when there is one.
  protected readonly cvs = computed(() =>
    (this.api.cvs.hasValue() ? this.api.cvs.value() : []).map(toCvListItem),
  );
  protected readonly listState = computed<CvListState>(() => {
    const cvs = this.api.cvs;
    const error = cvs.error();
    if (error !== undefined) return isUnreachable(error) ? 'unreachable' : 'failed';
    return cvs.hasValue() ? 'ready' : 'loading';
  });
  protected readonly hostProjectDir = computed(() =>
    this.api.setup.hasValue() ? this.api.setup.value().hostProjectDir : null,
  );
  protected readonly desktopExtensionUrl = this.api.desktopExtensionUrl;

  /** Ticks so that "2 min ago" stays current. */
  private readonly now = signal(new Date());
  private readonly claudeSessions = computed(() =>
    this.api.claudeSessions.hasValue() ? this.api.claudeSessions.value() : [],
  );
  protected readonly claudeStatus = computed(() => claudeStatus(this.claudeSessions(), this.now()));
  protected readonly claudeSessionLines = computed(() =>
    claudeSessionLines(this.claudeSessions(), this.now()),
  );

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

  protected readonly exporting = signal(false);
  protected readonly exportProblems = signal<readonly string[]>([]);
  protected readonly exportFailure = signal<string | null>(null);
  private readonly exportReport = viewChild.required(ExportReport);

  protected readonly mode = signal<PreviewMode>('visual');
  protected readonly zoom = signal<ZoomSetting>('fit');
  protected readonly documentInfo = signal<DocumentInfo | null>(null);

  /** Heights of the floating header and status bar; the document area keeps this much clear. */
  protected readonly headerHeight = signal(0);
  protected readonly footerHeight = signal(0);
  private readonly header = viewChild.required<DocumentHeader, ElementRef<HTMLElement>>(DocumentHeader, {
    read: ElementRef,
  });
  private readonly footer = viewChild.required<DocumentFooter, ElementRef<HTMLElement>>(DocumentFooter, {
    read: ElementRef,
  });

  /** Exports the selected CV; when the PDF check finds problems, shows them instead (unless forced). */
  protected async exportPdf(force = false): Promise<void> {
    const id = this.selectedId();
    if (!id || this.exporting()) return;
    this.exporting.set(true);
    try {
      const result = await this.api.exportPdf(id, force);
      if (result.kind === 'downloaded') return;
      this.exportProblems.set(result.kind === 'problems' ? result.problems : []);
      this.exportFailure.set(result.kind === 'failed' ? result.message : null);
      this.exportReport().open();
    } finally {
      this.exporting.set(false);
    }
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    const clock = setInterval(() => this.now.set(new Date()), 30_000);
    destroyRef.onDestroy(() => clearInterval(clock));

    afterNextRender(() => {
      const observer = new ResizeObserver(() => {
        this.headerHeight.set(this.header().nativeElement.getBoundingClientRect().height);
        this.footerHeight.set(this.footer().nativeElement.getBoundingClientRect().height);
      });
      observer.observe(this.header().nativeElement);
      observer.observe(this.footer().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

/**
 * No answer at all (status 0: refused, dropped or timed out), or the dev proxy's answer for a server that is
 * down. Any other error comes from a running server.
 */
function isUnreachable(error: Error): boolean {
  return !(error instanceof HttpErrorResponse) || [0, 502, 503, 504].includes(error.status);
}
