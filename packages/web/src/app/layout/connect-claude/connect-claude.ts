import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { CopyBlock } from '../../ui/copy-block/copy-block';
import type { ClaudeSessionLine } from '../claude-status';
import { DOCKER_PLACEHOLDER, PROJECT_PLACEHOLDER, desktopConfig, desktopPrompt } from '../desktop-config';

/**
 * How to connect Claude to Markup Résumé's MCP server (ADR-0003): Claude Code picks it up from
 * .mcp.json; Claude Desktop installs it as an extension downloaded from the app, or, as fallbacks,
 * gets an entry in its config from a prompt for Claude Code or by hand.
 * A native modal <dialog>: focus stays inside, Escape closes it; closedby="any" also closes it
 * on a backdrop click where the browser supports it.
 */
@Component({
  selector: 'mr-connect-claude',
  imports: [CopyBlock],
  templateUrl: './connect-claude.html',
  styleUrl: './connect-claude.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectClaude {
  /** Project folder on the host; null leaves a placeholder in the config. */
  readonly projectDir = input<string | null>(null);
  /** Where the app serves Markup Résumé as a Claude Desktop extension (.mcpb). */
  readonly extensionUrl = input.required<string>();
  /** Claude clients connected now, listed above the instructions. */
  readonly sessions = input<readonly ClaudeSessionLine[]>([]);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly dockerPlaceholder = DOCKER_PLACEHOLDER;
  protected readonly projectPlaceholder = PROJECT_PLACEHOLDER;
  protected readonly prompt = computed(() => desktopPrompt(this.projectDir()));
  protected readonly config = computed(() => desktopConfig(this.projectDir()));

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
