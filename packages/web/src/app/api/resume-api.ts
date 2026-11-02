import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const API = '/api/v1';
/** A server that hangs counts as unreachable after this long, instead of loading forever. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Pause before opening a new event stream after the server refused one. */
const EVENTS_RETRY_MS = 2_000;
/** Pause before a failed request is tried again, whatever made it fail. */
const RESOURCE_RETRY_MS = 5_000;

/**
 * Shape of GET /api/v1/resumes items. Mirrors ResumeListItem in packages/app/src/domain;
 * to be replaced by the shared domain types (ADR-0016).
 */
export interface ResumeListItemDto {
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly pinned: boolean;
}

/** Shape of GET /api/v1/me: the signed-in user (ADR-0027). */
export interface MeDto {
  readonly name: string | null;
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
/**
 * One problem of the PDF check, as GET /api/v1/resumes/:slug/pdf reports it. Mirrors PdfProblem in
 * packages/app/src/domain/pdf/pdf-check.ts.
 */
export type PdfProblemDto =
  | { readonly code: 'font-type3' | 'font-not-embedded' | 'font-no-unicode'; readonly font: string }
  | { readonly code: 'words-missing' | 'words-extra'; readonly words: readonly string[] }
  | { readonly code: 'block-out-of-order' | 'block-split'; readonly block: string }
  | { readonly code: 'link-not-clickable'; readonly text: string; readonly href: string };

export type PdfExport =
  | { readonly kind: 'downloaded' }
  /** The PDF check found problems, so the file was not handed out (ask again with force to get it anyway). */
  | { readonly kind: 'problems'; readonly problems: readonly PdfProblemDto[] }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Client of the server's CV API. Everything but /me waits for a signed-in user: signed out, the API answers 401,
 * and the UI shows the way to sign in instead (ADR-0027). A 401 later on (the session ended) signs the UI out.
 * Keeps the list fresh: the server's event stream
 * ("resume-changed") reloads the list and bumps `revision`, which the document URL carries
 * so the preview reloads too. "claude-changed" reloads the connected Claude sessions.
 * Nothing stays failed: a failed request is tried again every few seconds, and when the stream reconnects after
 * a server restart, "ready" reloads the data at once.
 */
@Injectable({ providedIn: 'root' })
export class ResumeApi {
  readonly me = httpResource<MeDto>(() => ({ url: `${API}/me`, timeout: REQUEST_TIMEOUT_MS }));
  /** The server answered that nobody is signed in. */
  readonly signedOut = computed(() => isSignedOut(this.me.error()));
  private readonly signedIn = computed(() => this.me.hasValue());

  readonly resumes = httpResource<readonly ResumeListItemDto[]>(() =>
    this.signedIn() ? { url: `${API}/resumes`, timeout: REQUEST_TIMEOUT_MS } : undefined,
  );
  readonly claudeSessions = httpResource<readonly ClaudeSessionDto[]>(() =>
    this.signedIn() ? { url: `${API}/claude/sessions`, timeout: REQUEST_TIMEOUT_MS } : undefined,
  );
  /** Increases on every change notification from the server. */
  readonly revision = signal(0);

  constructor() {
    let events: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;

    const connect = () => {
      events = new EventSource(`${API}/events`);
      connectedBefore = false;
      // "ready" after an earlier connection means the server is back: whatever it sent may be stale, and
      // whatever failed while it was down can load now. On the first connection only failures reload.
      events.addEventListener('ready', () => {
        for (const resource of [this.resumes, this.claudeSessions]) {
          if (connectedBefore || resource.error() !== undefined) resource.reload();
        }
        if (connectedBefore) this.revision.update((revision) => revision + 1);
        connectedBefore = true;
      });
      events.addEventListener('resume-changed', () => {
        this.resumes.reload();
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
    // The event stream is open while someone is signed in.
    effect((onCleanup) => {
      if (!this.signedIn()) {
        return;
      }
      connect();
      onCleanup(() => {
        clearTimeout(retry);
        events?.close();
      });
    });

    // status() goes error → reloading → error on each failed try, so the effect schedules the next one. Signed out
    // is not a failure: nothing is retried until the user signs in, which reloads the page.
    effect((onCleanup) => {
      if (this.me.status() !== 'error' || this.signedOut()) {
        return;
      }
      const timer = setTimeout(() => this.me.reload(), RESOURCE_RETRY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    for (const resource of [this.resumes, this.claudeSessions]) {
      effect((onCleanup) => {
        if (resource.status() !== 'error') {
          return;
        }
        // The session ended: asking /me again turns the UI to signed out.
        if (isSignedOut(resource.error())) {
          this.me.reload();
          return;
        }
        const timer = setTimeout(() => resource.reload(), RESOURCE_RETRY_MS);
        onCleanup(() => clearTimeout(timer));
      });
    }
  }

  /** Ends the session on the server; the UI then shows the way to sign in. */
  async signOut(): Promise<void> {
    await firstValueFrom(this.http.post(`/auth/logout`, null));
    this.me.reload();
  }

  private readonly http = inject(HttpClient);

  /**
   * Prints the CV to PDF on the server and saves the file to the user's downloads. A PDF that fails the
   * server's check is only handed out when forced.
   */
  async exportPdf(slug: string, force = false): Promise<PdfExport> {
    const url = `${API}/resumes/${encodeURIComponent(slug)}/pdf${force ? '?force=1' : ''}`;
    try {
      const response = await firstValueFrom(
        this.http.get(url, { responseType: 'blob', observe: 'response' }),
      );
      saveFile(
        response.body ?? new Blob(),
        fileName(response.headers.get('Content-Disposition')) ?? `${slug}.pdf`,
      );
      return { kind: 'downloaded' };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422 && error.error instanceof Blob) {
        const body = JSON.parse(await error.error.text()) as { problems: PdfProblemDto[] };
        return { kind: 'problems', problems: body.problems };
      }
      return { kind: 'failed', message: error instanceof HttpErrorResponse ? error.message : String(error) };
    }
  }

  togglePin(slug: string): Promise<{ pinned: boolean }> {
    return firstValueFrom(
      this.http.post<{ pinned: boolean }>(`${API}/resumes/${encodeURIComponent(slug)}/pin`, {}),
    );
  }

  documentUrl(slug: string, revision: number): string {
    return `${API}/resumes/${encodeURIComponent(slug)}/document?v=${revision}`;
  }
}

/** A 401 from the API: nobody is signed in, or the session ended. */
function isSignedOut(error: Error | undefined): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
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
