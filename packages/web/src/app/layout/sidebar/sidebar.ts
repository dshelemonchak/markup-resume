import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import type { CvListItem } from './cv-list-item';
import { SidebarItem } from './sidebar-item/sidebar-item';

/**
 * Left sidebar: brand, import, search, pinned and other CVs, Claude connection status.
 * Presentational: the list comes in through inputs, selection goes out through an output.
 * Import, search and the connection status are placeholders for now.
 */
@Component({
  selector: 'cvc-sidebar',
  imports: [DummyMark, GlassPanel, SidebarItem],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly items = input.required<readonly CvListItem[]>();
  readonly selectedId = input<string | null>(null);
  readonly selectCv = output<string>();

  protected readonly pinned = computed(() => this.items().filter((item) => item.pinned));
  protected readonly others = computed(() => this.items().filter((item) => !item.pinned));
}
