import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { CopyBlock } from '../../ui/copy-block/copy-block';
import { DOCKER_PLACEHOLDER, PROJECT_PLACEHOLDER, desktopConfig, desktopPrompt } from './desktop-config';

/**
 * How to connect Claude to cv-kit's MCP server (ADR-0003): Claude Code picks it up from
 * .mcp.json; Claude Desktop needs an entry in its config, best added by Claude Code from a prompt,
 * or by hand in Settings → Developer → Edit Config.
 * A native modal <dialog>: focus stays inside, Escape closes it; closedby="any" also closes it
 * on a backdrop click where the browser supports it.
 */
@Component({
  selector: 'cvc-connect-claude',
  imports: [CopyBlock],
  templateUrl: './connect-claude.html',
  styleUrl: './connect-claude.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectClaude {
  /** Project folder on the host; null leaves a placeholder in the config. */
  readonly projectDir = input<string | null>(null);

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
