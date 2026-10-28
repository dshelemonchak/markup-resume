import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { type ZoomSetting, canZoom, stepZoom } from './zoom';

/**
 * Zoom buttons: out, the current level (resets to 100%), in, and Fit.
 * The owner keeps the zoom setting; the scale it results in comes back from whoever
 * measures the available space (for "fit" only the canvas knows it).
 */
@Component({
  selector: 'cvc-zoom-control',
  templateUrl: './zoom-control.html',
  styleUrl: './zoom-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    'aria-label': 'Zoom',
  },
})
export class ZoomControl {
  readonly zoom = model<ZoomSetting>('fit');
  /** Scale currently applied, 1 = 100%. */
  readonly scale = input.required<number>();

  protected readonly percent = computed(() => Math.round(this.scale() * 100));
  protected readonly canZoomIn = computed(() => canZoom(this.scale(), 1));
  protected readonly canZoomOut = computed(() => canZoom(this.scale(), -1));

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
}
