import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { SECTION_PICTURES, type Section } from '../in-development-section';

/**
 * t(nav.applications, nav.masterFile, nav.templates, nav.account, inDevelopment.applications,
 * inDevelopment.masterFile, inDevelopment.templates, inDevelopment.account)
 */

/**
 * Stand-in for a screen that is not built yet: a faint outline of the future screen behind a card with the
 * section's title, what it will do and "In development", nothing pretending to work.
 * The section comes from the route's data.
 */
@Component({
  selector: 'mr-in-development',
  imports: [GlassPanel, TranslocoPipe],
  templateUrl: './in-development.html',
  styleUrl: './in-development.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InDevelopment {
  readonly section = input.required<Section>();

  protected readonly titleKey = computed(() => `nav.${this.section()}`);
  protected readonly teaserKey = computed(() => `inDevelopment.${this.section()}`);
  protected readonly picture = computed(
    () => `illustrations/in-development/${SECTION_PICTURES[this.section()]}`,
  );
}
