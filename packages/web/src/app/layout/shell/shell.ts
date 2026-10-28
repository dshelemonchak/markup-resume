import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Application frame: the full-window background (base colour + two blurred glows)
 * that every screen of the tool sits on. Content is projected into it.
 */
@Component({
  selector: 'mr-shell',
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {}
