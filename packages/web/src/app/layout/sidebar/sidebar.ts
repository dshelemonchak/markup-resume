import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DummyMark } from '../../ui/dummy-mark/dummy-mark';
import { GlassPanel } from '../../ui/glass-panel/glass-panel';
import type { ClaudeStatus } from '../claude-status';
import type { ResumeListItem, ResumeListState } from '../resume-list-item';
import { SidebarItem } from '../sidebar-item/sidebar-item';

/**
 * Left sidebar: import, search, pinned and other CVs, Claude's connection status, which also opens the
 * way to connect it, and the signed-in user with a way to sign out.
 * Presentational: the list comes in through inputs, selection and the connect request go out
 * through outputs. Import and search are placeholders for now.
 */
@Component({
  selector: 'mr-sidebar',
  imports: [DummyMark, GlassPanel, SidebarItem, TranslocoPipe],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly items = input.required<readonly ResumeListItem[]>();
  /** Says why the list is empty: not loaded yet, server down, or really no CVs. */
  readonly listState = input<ResumeListState>('ready');
  readonly selectedSlug = input<string | null>(null);
  readonly claude = input<ClaudeStatus>({
    connected: false,
    label: 'Connect Claude',
    description: 'Connect Claude',
    lastUsed: null,
  });
  /** The signed-in user's name; null while nobody is signed in. */
  readonly userName = input<string | null>(null);
  /** The last sign-out did not reach the server, so the user is still signed in. */
  readonly signOutFailed = input(false);
  readonly selectResume = output<string>();
  readonly connectClaude = output();
  readonly signOut = output();
  readonly togglePinResume = output<string>();

  protected readonly pinned = computed(() => this.items().filter((item) => item.pinned));
  protected readonly others = computed(() => this.items().filter((item) => !item.pinned));

  onTogglePinResume(slug: string): void {
    this.togglePinResume.emit(slug);
  }
}
