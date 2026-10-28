import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GlassTuner } from './glass-tuner';

describe('GlassTuner', () => {
  it('overrides a theme variable while open and clears it when destroyed', async () => {
    const root = TestBed.inject(DOCUMENT).documentElement;
    const fixture = TestBed.createComponent(GlassTuner);
    await fixture.whenStable();

    const range = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#--mr-glass-blur-radius',
    )!;
    range.value = '42';
    range.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.style.getPropertyValue('--mr-glass-blur-radius')).toBe('42px');

    fixture.destroy();
    expect(root.style.getPropertyValue('--mr-glass-blur-radius')).toBe('');
  });
});
