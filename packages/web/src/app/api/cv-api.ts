import { httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

const API = '/api/v1';

/**
 * Shape of GET /api/v1/cvs items. Mirrors CvSummary in packages/app/src/domain;
 * to be replaced by the shared domain types (ADR-0016).
 */
export interface CvSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

/**
 * Client of the local server's CV API. Keeps the list fresh: the server's event stream
 * ("cvs-changed") reloads the list and bumps `revision`, which the document URL carries
 * so the preview reloads too.
 */
@Injectable({ providedIn: 'root' })
export class CvApi {
  readonly cvs = httpResource<readonly CvSummaryDto[]>(() => `${API}/cvs`);
  /** Increases on every change notification from the server. */
  readonly revision = signal(0);

  constructor() {
    const events = new EventSource(`${API}/events`);
    events.addEventListener('cvs-changed', () => {
      this.cvs.reload();
      this.revision.update((revision) => revision + 1);
    });
    inject(DestroyRef).onDestroy(() => events.close());
  }

  documentUrl(id: string, revision: number): string {
    return `${API}/cvs/${encodeURIComponent(id)}/document?v=${revision}`;
  }
}
