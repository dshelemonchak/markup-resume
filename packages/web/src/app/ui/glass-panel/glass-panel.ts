import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type GlassPanelVariant = 'panel' | 'compact';

/**
 * Frosted-glass surface. The single source of the glass look for every panel of the UI.
 *
 * An attribute selector was chosen instead of an element component (<cvc-glass-panel>):
 * - accessibility: the host stays a semantic element (aside, header, footer), no wrapper node;
 * - ng-bootstrap: it can sit on elements that carry ng-bootstrap directives, e.g. ngbDropdownMenu.
 *
 * Limited to the block elements the UI uses:
 *   <aside cvc-glass-panel>…</aside>                       sidebar
 *   <header cvc-glass-panel>…</header>                     title bar and toolbar
 *   <footer cvc-glass-panel>…</footer>                     status bar
 *   <section cvc-glass-panel>…</section>                   card, report
 *   <div cvc-glass-panel variant="compact">…</div>         floating control, menu
 */
@Component({
  selector:
    'aside[cvc-glass-panel], header[cvc-glass-panel], footer[cvc-glass-panel], section[cvc-glass-panel], div[cvc-glass-panel]',
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
