import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ResumeListItem } from '../resume-list-item';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap';

/** One CV row in the sidebar. Display only for now; hover actions and rename come later. */
@Component({
  selector: 'mr-sidebar-item',
  imports: [TranslocoPipe, GlassPanel, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem],
  templateUrl: './sidebar-item.html',
  styleUrl: './sidebar-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarItem {
  readonly item = input.required<ResumeListItem>();
  readonly selected = input(false);
  readonly selectResume = output<string>();

  /** The actions menu is open: its button stays visible after the pointer leaves the row. */
  protected readonly menuOpen = signal(false);
}
