import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { type ZoomSetting, fitScale } from '../../ui/zoom-control/zoom';
import type { PreviewMode } from '../document-header/preview-mode';
import { type DocumentInfo, pageCount, primaryFontFamily } from './document-info';

/** A4 at 96 dpi: 210 × 297 mm. */
const PAGE = { width: 794, height: 1123 } as const;

/**
 * Preview of one CV document. The CV is a standalone HTML file rendered in a sandboxed iframe,
 * so the app's styles and the CV's styles never mix and the preview matches the PDF render:
 * no scripts run inside (no allow-scripts), but same origin lets the app measure the document
 * and switch its data-cv-mode (visual / ATS).
 *
 * The zoom setting is owned outside (the controls live in the status bar); the canvas turns it
 * into a scale, since only the canvas knows the space available for "fit".
 */
@Component({
  selector: 'cvc-document-canvas',
  templateUrl: './document-canvas.html',
  styleUrl: './document-canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentCanvas {
  /** URL of the CV document. App-provided, never user input. */
  readonly src = input.required<string>();
  readonly mode = input<PreviewMode>('visual');
  readonly zoom = model<ZoomSetting>('fit');
  /** Emitted whenever the measured pages, font or the applied scale change. */
  readonly documentInfo = output<DocumentInfo>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');

  protected readonly pageWidth = PAGE.width;
  protected readonly safeSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.src()));

  private readonly available = signal({ width: 0, height: 0 });
  private readonly loaded = signal(false);
  protected readonly contentHeight = signal<number>(PAGE.height);
  private readonly font = signal<string | null>(null);

  protected readonly scale = computed(() => {
    const zoom = this.zoom();
    return zoom === 'fit' ? fitScale(this.available(), PAGE) : zoom;
  });
  private readonly info = computed<DocumentInfo>(() => ({
    pages: pageCount(this.contentHeight(), PAGE.height),
    font: this.font(),
    scale: this.scale(),
  }));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // contentRect excludes the viewport's padding, so it is the space the sheet may use.
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const { width, height } = entry.contentRect;
        this.available.set({ width, height });
      });
      observer.observe(this.viewport().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(() => {
      const mode = this.mode();
      if (this.loaded()) this.applyMode(mode);
    });

    effect(() => this.documentInfo.emit(this.info()));
  }

  protected onLoad(): void {
    this.loaded.set(true);
    this.applyMode(this.mode());
  }

  /** Switches the document's mode, then measures it: height for the frame, pages and font. */
  private applyMode(mode: PreviewMode): void {
    const document = this.frame().nativeElement.contentDocument;
    if (!document?.documentElement) return;
    document.documentElement.setAttribute('data-cv-mode', mode);
    this.contentHeight.set(Math.max(PAGE.height, document.documentElement.scrollHeight));
    const view = document.defaultView;
    this.font.set(
      view && document.body ? primaryFontFamily(view.getComputedStyle(document.body).fontFamily) : null,
    );
  }
}
