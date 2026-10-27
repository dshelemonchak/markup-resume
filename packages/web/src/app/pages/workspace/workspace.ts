import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DocumentHeader } from '../../layout/document-header/document-header';
import type { PreviewMode } from '../../layout/document-header/preview-mode';
import type { CvListItem } from '../../layout/sidebar/cv-list-item';
import { Sidebar } from '../../layout/sidebar/sidebar';

/** Placeholder list until the server API exists. */
const STUB_CVS: readonly CvListItem[] = [
  {
    id: 'senior-angular',
    title: 'Senior Angular Developer',
    subtitle: 'senior-angular · edited by Claude',
    status: 'valid',
    pinned: true,
  },
  {
    id: 'fullstack-java-angular',
    title: 'Full-Stack · Java + Angular',
    subtitle: 'fullstack-java-angular · edited by you',
    status: 'valid',
    pinned: true,
  },
  {
    id: 'senior-frontend',
    title: 'Senior Frontend Engineer',
    subtitle: 'senior-frontend · overflows 1 page',
    status: 'warning',
    pinned: false,
  },
  {
    id: 'vacancy-acme-angular',
    title: 'Acme — Angular role',
    subtitle: 'vacancy-acme-angular · variant',
    status: 'valid',
    pinned: false,
  },
  {
    id: 'frontend-generic',
    title: 'Frontend (generic)',
    subtitle: 'frontend-generic · not exported',
    status: 'not-exported',
    pinned: false,
  },
];

/** Main screen: sidebar on the left; top bar and the selected CV (not built yet) on the right. */
@Component({
  selector: 'cvc-workspace',
  imports: [DocumentHeader, Sidebar],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Workspace {
  protected readonly cvs = signal(STUB_CVS);
  protected readonly selectedId = signal<string | null>(STUB_CVS[0]?.id ?? null);
  protected readonly selectedCv = computed(
    () => this.cvs().find((cv) => cv.id === this.selectedId()) ?? null,
  );
  protected readonly mode = signal<PreviewMode>('visual');
}
