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

/** Shape of GET /api/v1/claude/sessions items. Mirrors ClaudeSession in packages/app/src/app. */
export interface ClaudeSessionDto {
  readonly id: string;
  readonly client: string;
  readonly version: string | null;
  readonly connectedAt: string;
  readonly lastActivityAt: string | null;
}

/** Shape of GET /api/v1/setup. */
export interface SetupDto {
  /** Project folder on the host; null when the server does not know it. */
  readonly hostProjectDir: string | null;
}

/**
 * Client of the local server's CV API. Keeps the list fresh: the server's event stream
 * ("cvs-changed") reloads the list and bumps `revision`, which the document URL carries
 * so the preview reloads too. "claude-changed" reloads the connected Claude sessions.
 */
@Injectable({ providedIn: 'root' })
export class CvApi {
  readonly cvs = httpResource<readonly CvSummaryDto[]>(() => `${API}/cvs`);
  readonly setup = httpResource<SetupDto>(() => `${API}/setup`);
  /** cv-kit as a Claude Desktop extension, a file to download and install. */
  readonly desktopExtensionUrl = `${API}/claude/desktop-extension`;
  readonly claudeSessions = httpResource<readonly ClaudeSessionDto[]>(() => `${API}/claude/sessions`);
  /** Increases on every change notification from the server. */
  readonly revision = signal(0);

  constructor() {
    const events = new EventSource(`${API}/events`);
    events.addEventListener('cvs-changed', () => {
      this.cvs.reload();
      this.revision.update((revision) => revision + 1);
    });
    events.addEventListener('claude-changed', () => this.claudeSessions.reload());
    inject(DestroyRef).onDestroy(() => events.close());
  }

  documentUrl(id: string, revision: number): string {
    return `${API}/cvs/${encodeURIComponent(id)}/document?v=${revision}`;
  }
}
