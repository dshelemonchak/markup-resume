import { ChangeDetectionStrategy, Component, type ElementRef, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Preformatted text with a Copy button. When the browser refuses the clipboard (an embedded
 * browser, a missing permission), the text is selected instead for the user to copy.
 */
@Component({
  selector: 'mr-copy-block',
  imports: [TranslocoPipe],
  templateUrl: './copy-block.html',
  styleUrl: './copy-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyBlock {
  readonly text = input.required<string>();

  private readonly code = viewChild.required<ElementRef<HTMLElement>>('code');

  /** 'selected': the clipboard was refused and the text is selected. */
  protected readonly state = signal<'idle' | 'copied' | 'selected'>('idle');

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.state.set('copied');
    } catch {
      getSelection()?.selectAllChildren(this.code().nativeElement);
      this.state.set('selected');
    }
  }
}
