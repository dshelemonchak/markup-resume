import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { GlassTuner } from '../../ui/glass-tuner/glass-tuner';

/** Temporary page showing UI building blocks while the real screens are built. */
@Component({
  selector: 'cvc-playground',
  imports: [GlassPanel, GlassTuner],
  templateUrl: './playground.html',
  styleUrl: './playground.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Playground {}
