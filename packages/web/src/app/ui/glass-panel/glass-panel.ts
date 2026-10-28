import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type GlassPanelVariant = 'panel' | 'compact';

/**
 * Frosted-glass surface. The single source of the glass look for every panel of the UI.
 *
 * An attribute selector was chosen instead of an element component (<mr-glass-panel>):
 * - accessibility: the host stays a semantic element (aside, header, footer), no wrapper node;
 * - ng-bootstrap: it can sit on elements that carry ng-bootstrap directives, e.g. ngbDropdownMenu.
 *
 * Limited to the block elements the UI uses:
 *   <aside mr-glass-panel>…</aside>                       sidebar
 *   <header mr-glass-panel>…</header>                     title bar and toolbar
 *   <footer mr-glass-panel>…</footer>                     status bar
 *   <section mr-glass-panel>…</section>                   card, report
 *   <div mr-glass-panel variant="compact">…</div>         floating control, menu
 */
@Component({
  selector:
    'aside[mr-glass-panel], header[mr-glass-panel], footer[mr-glass-panel], section[mr-glass-panel], div[mr-glass-panel]',
  template: '<ng-content />',
  styleUrl: './glass-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': "variant() === 'compact'",
  },
})
export class GlassPanel {
  readonly variant = input<GlassPanelVariant>('panel');
}
