import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ResumeApi } from '../../api/resume-api';
import { AppHeader } from '../app-header/app-header';

/**
 * Frame of the signed-in pages: the flat app background, the global header, and the page under it.
 * The landing page has its own layout and does not use it.
 */
@Component({
  selector: 'mr-shell',
  imports: [AppHeader, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly api = inject(ResumeApi);

  protected readonly userName = computed(() =>
    this.api.currentUser.hasValue() ? this.api.currentUser.value().name : null,
  );
}
