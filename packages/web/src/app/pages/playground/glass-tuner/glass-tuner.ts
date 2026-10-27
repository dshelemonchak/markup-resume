import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { GlassPanel } from '../../../ui/glass-panel/glass-panel';

interface TunerParam {
  readonly name: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

const PARAMS: readonly TunerParam[] = [
  { name: '--cvc-glass-opacity', label: 'Panel opacity', min: 0, max: 1, step: 0.05, unit: '' },
  { name: '--cvc-glass-blur-radius', label: 'Blur', min: 0, max: 60, step: 1, unit: 'px' },
  { name: '--cvc-glass-saturation', label: 'Saturation', min: 100, max: 250, step: 5, unit: '%' },
  { name: '--cvc-glass-border-alpha', label: 'Border', min: 0, max: 1, step: 0.05, unit: '' },
  { name: '--cvc-glass-highlight-alpha', label: 'Top highlight', min: 0, max: 1, step: 0.05, unit: '' },
  { name: '--cvc-glass-shadow-alpha', label: 'Shadow', min: 0, max: 0.4, step: 0.01, unit: '' },
  { name: '--cvc-glow-opacity', label: 'Background glow', min: 0, max: 0.8, step: 0.05, unit: '' },
];

/**
 * TEMPORARY: live tuning of the glass tokens from styles/_theme.scss.
 * Starts from the theme's values, overrides them on <html> while the page is open,
 * and produces the SCSS lines to copy back into the theme. Remove with the playground.
 */
@Component({
  selector: 'cvc-glass-tuner',
  imports: [GlassPanel],
  templateUrl: './glass-tuner.html',
  styleUrl: './glass-tuner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlassTuner {
  private readonly root = inject(DOCUMENT).documentElement;

  protected readonly params = PARAMS;
  private readonly initial = this.readThemeValues();
  protected readonly values = signal<Record<string, number>>({ ...this.initial });
  protected readonly copied = signal(false);

  protected readonly snippet = computed(() =>
    PARAMS.map((p) => `  ${p.name}: ${this.values()[p.name]}${p.unit};`).join('\n'),
  );

  constructor() {
    effect(() => {
      const values = this.values();
      for (const p of PARAMS) this.root.style.setProperty(p.name, `${values[p.name]}${p.unit}`);
    });
    inject(DestroyRef).onDestroy(() => this.clearOverrides());
  }

  protected set(name: string, raw: string): void {
    this.values.update((values) => ({ ...values, [name]: Number(raw) }));
    this.copied.set(false);
  }

  protected reset(): void {
    this.values.set({ ...this.initial });
    this.copied.set(false);
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.snippet());
    this.copied.set(true);
  }

  private readThemeValues(): Record<string, number> {
    const style = getComputedStyle(this.root);
    return Object.fromEntries(
      PARAMS.map((p) => {
        const value = parseFloat(style.getPropertyValue(p.name));
        return [p.name, Number.isNaN(value) ? p.min : value];
      }),
    );
  }

  private clearOverrides(): void {
    for (const p of PARAMS) this.root.style.removeProperty(p.name);
  }
}
