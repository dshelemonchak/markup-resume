import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import type { ClaudeStatus } from '../claude-status';
import type { CvListItem, CvListState } from '../cv-list-item';
import { SidebarItem } from '../sidebar-item/sidebar-item';

/**
 * Left sidebar: brand, import, search, pinned and other CVs, and Claude's connection status,
 * which also opens the way to connect it.
 * Presentational: the list comes in through inputs, selection and the connect request go out
 * through outputs. Import and search are placeholders for now.
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
  /** Says why the list is empty: not loaded yet, server down, or really no CVs. */
  readonly listState = input<CvListState>('ready');
  readonly selectedId = input<string | null>(null);
  readonly claude = input<ClaudeStatus>({
    connected: false,
    label: 'Connect Claude',
    description: 'Connect Claude',
    lastUsed: null,
  });
  readonly selectCv = output<string>();
  readonly connectClaude = output();

  protected readonly pinned = computed(() => this.items().filter((item) => item.pinned));
  protected readonly others = computed(() => this.items().filter((item) => !item.pinned));
}
