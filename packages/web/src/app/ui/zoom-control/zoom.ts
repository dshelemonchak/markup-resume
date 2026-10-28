export interface Size {
  readonly width: number;
  readonly height: number;
}

/** 'fit' follows the available space; a number is a fixed scale (1 = 100%). */
export type ZoomSetting = 'fit' | number;

export const ZOOM_STEPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const MIN_ZOOM = ZOOM_STEPS[0]!;
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

/** Scale at which the whole page fits into the available area. */
export function fitScale(available: Size, page: Size): number {
  if (available.width <= 0 || available.height <= 0) return 1;
  const scale = Math.min(available.width / page.width, available.height / page.height);
  return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);
}

/** Next preset step above or below the current scale (which may lie between steps after "fit"). */
export function stepZoom(current: number, direction: 1 | -1): number {
  const epsilon = 0.001;
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + epsilon) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - epsilon) ?? MIN_ZOOM;
}

export const canZoom = (current: number, direction: 1 | -1): boolean =>
  direction > 0 ? current < MAX_ZOOM - 0.001 : current > MIN_ZOOM + 0.001;
