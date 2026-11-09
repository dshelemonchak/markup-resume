import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Stand-in for a screen that is not built yet: its title and "In development", nothing pretending to work.
 * The title comes from the route's data (`titleKey`, a Transloco key).
 */
@Component({
  selector: 'mr-in-development',
  imports: [TranslocoPipe],
  templateUrl: './in-development.html',
  styleUrl: './in-development.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InDevelopment {
  readonly titleKey = input.required<string>();
}
