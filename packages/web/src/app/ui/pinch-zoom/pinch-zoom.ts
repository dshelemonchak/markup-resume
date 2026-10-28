import { DestroyRef, Directive, ElementRef, inject, input, model } from '@angular/core';
import { type ZoomSetting, clamp, scaleZoom } from '../zoom';

/** Safari's non-standard pinch event; scale is relative to the start of the gesture. */
interface GestureEvent extends UIEvent {
  readonly scale: number;
}

/** Wheel delta to zoom factor: a trackpad pinch sends small deltas, a mouse notch is capped. */
const WHEEL_SENSITIVITY = 0.01;
const MAX_WHEEL_DELTA = 25;

/**
 * Turns a trackpad pinch over the host into zoom, instead of the browser zooming the whole page.
 * Chrome, Edge and Firefox report a pinch as a wheel event with ctrlKey set (so does ctrl + mouse
 * wheel); Safari sends gesture events instead. Plain scrolling is left alone.
 *
 * An iframe gets its own events, so the directive also listens on the document of each
 * same-origin iframe inside the host as it loads.
 */
@Directive({ selector: '[cvcPinchZoom]' })
export class PinchZoom {
  readonly zoom = model<ZoomSetting>('fit');
  /** Scale the content is shown at; the starting point while zoom is 'fit'. */
  readonly scale = input.required<number>();

  private gestureStartScale = 1;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const controller = new AbortController();
    inject(DestroyRef).onDestroy(() => controller.abort());
    const options = { passive: false, signal: controller.signal };

    const listen = (target: EventTarget) => {
      target.addEventListener('wheel', (event) => this.onWheel(event as WheelEvent), options);
      target.addEventListener('gesturestart', (event) => this.onGestureStart(event as GestureEvent), options);
      target.addEventListener(
        'gesturechange',
        (event) => this.onGestureChange(event as GestureEvent),
        options,
      );
    };

    listen(host);
    // load does not bubble, but it can be caught on the way down to the iframe.
    host.addEventListener(
      'load',
      (event) => {
        const document = event.target instanceof HTMLIFrameElement ? event.target.contentDocument : null;
        if (document) listen(document);
      },
      { capture: true, signal: controller.signal },
    );
  }

  private current(): number {
    const zoom = this.zoom();
    return zoom === 'fit' ? this.scale() : zoom;
  }

  private onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = clamp(event.deltaY, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
    this.zoom.set(scaleZoom(this.current(), Math.exp(-delta * WHEEL_SENSITIVITY)));
  }

  private onGestureStart(event: GestureEvent): void {
    event.preventDefault();
    this.gestureStartScale = this.current();
  }

  private onGestureChange(event: GestureEvent): void {
    event.preventDefault();
    this.zoom.set(scaleZoom(this.gestureStartScale, event.scale));
  }
}
