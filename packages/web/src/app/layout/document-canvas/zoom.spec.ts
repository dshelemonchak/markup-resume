import { canZoom, fitScale, stepZoom } from './zoom';

const A4 = { width: 794, height: 1123 };

describe('fitScale', () => {
  it('fits the whole page into the available area', () => {
    expect(fitScale({ width: 794, height: 561.5 }, A4)).toBeCloseTo(0.5);
    expect(fitScale({ width: 397, height: 2000 }, A4)).toBeCloseTo(0.5);
  });

  it('falls back to 100% before the area is measured', () => {
    expect(fitScale({ width: 0, height: 0 }, A4)).toBe(1);
  });

  it('stays within the zoom limits', () => {
    expect(fitScale({ width: 10, height: 10 }, A4)).toBe(0.25);
    expect(fitScale({ width: 10_000, height: 10_000 }, A4)).toBe(2);
  });
});

describe('stepZoom', () => {
  it('moves to the next preset step', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it('snaps to the nearest step from an in-between fit scale', () => {
    expect(stepZoom(0.63, 1)).toBe(0.75);
    expect(stepZoom(0.63, -1)).toBe(0.5);
  });

  it('stops at the limits', () => {
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(canZoom(2, 1)).toBe(false);
    expect(canZoom(0.25, -1)).toBe(false);
    expect(canZoom(1, 1)).toBe(true);
  });
});
