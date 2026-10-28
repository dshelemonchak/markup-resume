import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const API = '/api/v1';
/** A server that hangs counts as unreachable after this long, instead of loading forever. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Pause before opening a new event stream after the server refused one. */
const EVENTS_RETRY_MS = 2_000;
/** Pause before a failed request is tried again, whatever made it fail. */
const RESOURCE_RETRY_MS = 5_000;

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

/** What exporting a CV to PDF came to. */
export type PdfExport =
  | { readonly kind: 'downloaded' }
  /** The PDF check found problems, so the file was not handed out (ask again with force to get it anyway). */
  | { readonly kind: 'problems'; readonly problems: readonly string[] }
  | { readonly kind: 'failed'; readonly message: string };

/** Shape of GET /api/v1/setup. */
export interface SetupDto {
  /** Project folder on the host; null when the server does not know it. */
  readonly hostProjectDir: string | null;
}

/**
 * Client of the local server's CV API. Keeps the list fresh: the server's event stream
 * ("cvs-changed") reloads the list and bumps `revision`, which the document URL carries
 * so the preview reloads too. "claude-changed" reloads the connected Claude sessions.
 * Nothing stays failed: a failed request is tried again every few seconds, and when the stream reconnects after
 * a server restart, "ready" reloads the data at once.
 */
@Injectable({ providedIn: 'root' })
export class CvApi {
  readonly cvs = httpResource<readonly CvSummaryDto[]>(() => ({
    url: `${API}/cvs`,
    timeout: REQUEST_TIMEOUT_MS,
  }));
  readonly setup = httpResource<SetupDto>(() => ({ url: `${API}/setup`, timeout: REQUEST_TIMEOUT_MS }));
  /** cv-kit as a Claude Desktop extension, a file to download and install. */
  readonly desktopExtensionUrl = `${API}/claude/desktop-extension`;
  readonly claudeSessions = httpResource<readonly ClaudeSessionDto[]>(() => ({
    url: `${API}/claude/sessions`,
    timeout: REQUEST_TIMEOUT_MS,
  }));
  /** Increases on every change notification from the server. */
  readonly revision = signal(0);

  constructor() {
    let events: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;

    const connect = () => {
      events = new EventSource(`${API}/events`);
      // "ready" after an earlier connection means the server is back: whatever it sent may be stale, and
      // whatever failed while it was down can load now. On the first connection only failures reload.
      events.addEventListener('ready', () => {
        for (const resource of [this.cvs, this.setup, this.claudeSessions]) {
          if (connectedBefore || resource.error() !== undefined) resource.reload();
        }
        if (connectedBefore) this.revision.update((revision) => revision + 1);
        connectedBefore = true;
      });
      events.addEventListener('cvs-changed', () => {
        this.cvs.reload();
        this.revision.update((revision) => revision + 1);
      });
      events.addEventListener('claude-changed', () => this.claudeSessions.reload());
      // EventSource retries a dropped connection itself, but gives up for good on an HTTP error, such as the
      // dev proxy's 502 while the server is down. Then a new one is opened.
      events.addEventListener('error', () => {
        if (events?.readyState !== EventSource.CLOSED) return;
        retry = setTimeout(connect, EVENTS_RETRY_MS);
      });
    };
    connect();

    // status() goes error → reloading → error on each failed try, so the effect schedules the next one.
    for (const resource of [this.cvs, this.setup, this.claudeSessions]) {
      effect((onCleanup) => {
        if (resource.status() !== 'error') return;
        const timer = setTimeout(() => resource.reload(), RESOURCE_RETRY_MS);
        onCleanup(() => clearTimeout(timer));
      });
    }

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(retry);
      events?.close();
    });
  }

  private readonly http = inject(HttpClient);

  /**
   * Prints the CV to PDF on the server and saves the file to the user's downloads. A PDF that fails the
   * server's check is only handed out when forced.
   */
  async exportPdf(id: string, force = false): Promise<PdfExport> {
    const url = `${API}/cvs/${encodeURIComponent(id)}/pdf${force ? '?force=1' : ''}`;
    try {
      const response = await firstValueFrom(
        this.http.get(url, { responseType: 'blob', observe: 'response' }),
      );
      saveFile(
        response.body ?? new Blob(),
        fileName(response.headers.get('Content-Disposition')) ?? `${id}.pdf`,
      );
      return { kind: 'downloaded' };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422 && error.error instanceof Blob) {
        const body = JSON.parse(await error.error.text()) as { problems: string[] };
        return { kind: 'problems', problems: body.problems };
      }
      return { kind: 'failed', message: error instanceof HttpErrorResponse ? error.message : String(error) };
    }
  }

  documentUrl(id: string, revision: number): string {
    return `${API}/cvs/${encodeURIComponent(id)}/document?v=${revision}`;
  }
}

/** The file name from Content-Disposition, preferring the UTF-8 one (filename*). */
function fileName(header: string | null): string | null {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '')?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return /filename="([^"]+)"/i.exec(header ?? '')?.[1] ?? null;
}

/** Hands a file to the browser's download, as a link with the download attribute would. */
function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has started from the URL by now; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
