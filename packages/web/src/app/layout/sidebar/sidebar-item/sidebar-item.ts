import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CvListItem } from '../cv-list-item';

/** One CV row in the sidebar. Display only for now; hover actions and rename come later. */
@Component({
  selector: 'cvc-sidebar-item',
  templateUrl: './sidebar-item.html',
  styleUrl: './sidebar-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarItem {
  readonly item = input.required<CvListItem>();
  readonly selected = input(false);
  readonly selectCv = output<string>();
}
