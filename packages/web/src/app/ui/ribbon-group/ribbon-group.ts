import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One group of the toolbar ribbon: the projected control(s) with a caption underneath,
 * like a Word ribbon group. The caption also names the group for assistive technology.
 */
@Component({
  selector: 'mr-ribbon-group',
  template: `
    <div class="control"><ng-content /></div>
    <div class="caption" aria-hidden="true">{{ label() }}</div>
  `,
  styleUrl: './ribbon-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    '[attr.aria-label]': 'label()',
  },
})
export class RibbonGroup {
  readonly label = input.required<string>();
}
