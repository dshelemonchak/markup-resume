import { ChangeDetectionStrategy, Component, type ElementRef, input, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CopyBlock } from '../../ui/copy-block/copy-block';
import type { ClaudeSessionLine } from '../claude-status';

/** The hosted MCP server; the same for a local and a hosted run. */
const MCP_URL = 'https://markup-resume.xyz/mcp';

/**
 * How to connect Claude to Markup Résumé's MCP server, which the app serves at /mcp (ADR-0023): both Claude Code
 * and Claude Desktop are pointed at the hosted HTTPS address, with Copy buttons for the address and the command.
 * A native modal <dialog>: focus stays inside, Escape closes it; closedby="any" also closes it
 * on a backdrop click where the browser supports it.
 */
@Component({
  selector: 'mr-connect-claude',
  imports: [CopyBlock, TranslocoPipe],
  templateUrl: './connect-claude.html',
  styleUrl: './connect-claude.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectClaude {
  /** Claude clients connected now, listed above the instructions. */
  readonly sessions = input<readonly ClaudeSessionLine[]>([]);

  protected readonly mcpUrl = MCP_URL;
  protected readonly claudeCodeCommand = `claude mcp add --transport http markup-resume ${MCP_URL}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
