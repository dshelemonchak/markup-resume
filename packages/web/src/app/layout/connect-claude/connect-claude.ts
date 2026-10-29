import { ChangeDetectionStrategy, Component, type ElementRef, input, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ClaudeSessionLine } from '../claude-status';

/**
 * How to connect Claude to Markup Résumé's MCP server, which the app serves at /mcp (ADR-0023): Claude Code
 * picks it up from .mcp.json. Claude Desktop needs a public HTTPS address, so it waits for the hosted version.
 * A native modal <dialog>: focus stays inside, Escape closes it; closedby="any" also closes it
 * on a backdrop click where the browser supports it.
 */
@Component({
  selector: 'mr-connect-claude',
  imports: [TranslocoPipe],
  templateUrl: './connect-claude.html',
  styleUrl: './connect-claude.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectClaude {
  /** Claude clients connected now, listed above the instructions. */
  readonly sessions = input<readonly ClaudeSessionLine[]>([]);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
