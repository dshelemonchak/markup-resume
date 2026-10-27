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
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import type { PreviewMode } from '../document-header/preview-mode';
import { type ZoomSetting, canZoom, fitScale, stepZoom } from './zoom';

/** A4 at 96 dpi: 210 × 297 mm. */
const PAGE = { width: 794, height: 1123 } as const;

/**
 * Preview of one CV document. The CV is a standalone HTML file rendered in a sandboxed iframe,
 * so the app's styles and the CV's styles never mix and the preview matches the PDF render:
 * no scripts run inside (no allow-scripts), but same origin lets the app measure the document
 * and switch its data-cv-mode (visual / ATS).
 */
@Component({
  selector: 'cvc-document-canvas',
  imports: [GlassPanel],
  templateUrl: './document-canvas.html',
  styleUrl: './document-canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentCanvas {
  /** URL of the CV document. App-provided, never user input. */
  readonly src = input.required<string>();
  readonly mode = input<PreviewMode>('visual');

  private readonly sanitizer = inject(DomSanitizer);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');

  protected readonly pageWidth = PAGE.width;
  protected readonly safeSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.src()));

  private readonly available = signal({ width: 0, height: 0 });
  private readonly loaded = signal(false);
  protected readonly contentHeight = signal<number>(PAGE.height);

  protected readonly zoom = signal<ZoomSetting>('fit');
  protected readonly scale = computed(() => {
    const zoom = this.zoom();
    return zoom === 'fit' ? fitScale(this.available(), PAGE) : zoom;
  });
  protected readonly percent = computed(() => Math.round(this.scale() * 100));
  protected readonly canZoomIn = computed(() => canZoom(this.scale(), 1));
  protected readonly canZoomOut = computed(() => canZoom(this.scale(), -1));

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
  }

  protected onLoad(): void {
    this.loaded.set(true);
    this.applyMode(this.mode());
  }

  protected zoomIn(): void {
    this.zoom.set(stepZoom(this.scale(), 1));
  }

  protected zoomOut(): void {
    this.zoom.set(stepZoom(this.scale(), -1));
  }

  protected resetZoom(): void {
    this.zoom.set(1);
  }

  protected fit(): void {
    this.zoom.set('fit');
  }

  /** Switches the document's mode and resizes the frame to the document's height. */
  private applyMode(mode: PreviewMode): void {
    const document = this.frame().nativeElement.contentDocument;
    if (!document?.documentElement) return;
    document.documentElement.setAttribute('data-cv-mode', mode);
    this.contentHeight.set(Math.max(PAGE.height, document.documentElement.scrollHeight));
  }
}
