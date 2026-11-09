import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** One entry of the main navigation. */
interface NavLink {
  readonly path: string;
  /** Transloco key of the label. */
  readonly label: string;
}

/** t(nav.applications, nav.cvs, nav.masterFile, nav.templates) */
const LINKS: readonly NavLink[] = [
  { path: '/applications', label: 'nav.applications' },
  { path: '/cvs', label: 'nav.cvs' },
  { path: '/master-file', label: 'nav.masterFile' },
  { path: '/templates', label: 'nav.templates' },
];

/**
 * Global header of the signed-in pages: the mark and the app name, the main navigation and the account link.
 * The current page is marked by the router (aria-current="page").
 */
@Component({
  selector: 'mr-app-header',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  /** The signed-in user's name; null while unknown or signed out. */
  readonly userName = input<string | null>(null);

  protected readonly links = LINKS;

  /** Up to two initials of the user's name for the account link, or null to show an icon instead. */
  protected readonly initials = computed(() => {
    const words = this.userName()?.trim().split(/\s+/).filter(Boolean) ?? [];
    return words.length
      ? words
          .slice(0, 2)
          .map((word) => word.charAt(0).toUpperCase())
          .join('')
      : null;
  });
}
