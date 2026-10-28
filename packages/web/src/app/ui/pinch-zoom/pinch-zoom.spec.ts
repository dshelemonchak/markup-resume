import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PinchZoom } from './pinch-zoom';
import type { ZoomSetting } from '../zoom';

@Component({
  imports: [PinchZoom],
  template: `<div cvcPinchZoom [(zoom)]="zoom" [scale]="0.5"></div>`,
})
class Host {
  readonly zoom = signal<ZoomSetting>('fit');
}

describe('PinchZoom', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const target = (fixture.nativeElement as HTMLElement).querySelector('div')!;
    return { zoom: fixture.componentInstance.zoom, target };
  }

  function gesture(type: string, scale: number): Event {
    return Object.assign(new Event(type, { cancelable: true }), { scale });
  }

  it('zooms on a pinch reported as ctrl + wheel, from the fit scale', async () => {
    const { zoom, target } = await render();
    const pinch = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, cancelable: true });
    target.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    expect(zoom()).toBeCloseTo(0.5 * Math.exp(0.1));
  });

  it('leaves plain scrolling alone', async () => {
    const { zoom, target } = await render();
    const scroll = new WheelEvent('wheel', { deltaY: -10, cancelable: true });
    target.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    expect(zoom()).toBe('fit');
  });

  it("zooms on Safari's gesture events relative to the gesture start", async () => {
    const { zoom, target } = await render();
    target.dispatchEvent(gesture('gesturestart', 1));
    target.dispatchEvent(gesture('gesturechange', 1.5));
    expect(zoom()).toBeCloseTo(0.75);
    target.dispatchEvent(gesture('gesturechange', 2));
    expect(zoom()).toBeCloseTo(1);
  });
});
