import { type FSWatcher, watch } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CvId,
  type CvRepository,
  type CvSummary,
  isValidCvId,
  readCvTitle,
} from '../../domain/index.ts';

const DOCUMENT_FILE = 'document.html';
/** Editors and Claude often write a file in several steps; one notification per burst is enough. */
const WATCH_DEBOUNCE_MS = 100;

/**
 * CV storage on disk (ADR-0012): one folder per CV.
 *
 *   <dataDir>/cvs/<id>/document.html
 *
 * Folders whose name is not a valid id, or that have no document.html, are ignored.
 */
export class FsCvRepository implements CvRepository {
  private readonly cvsDir: string;

  constructor(dataDir: string) {
    this.cvsDir = join(dataDir, 'cvs');
  }

  /** Creates the storage folder if it does not exist yet. */
  async init(): Promise<void> {
    await mkdir(this.cvsDir, { recursive: true });
  }

  async list(): Promise<readonly CvSummary[]> {
    const entries = await readdir(this.cvsDir, { withFileTypes: true });
    const ids = entries.filter((entry) => entry.isDirectory() && isValidCvId(entry.name)).map((e) => e.name);
    const summaries = await Promise.all(ids.map((id) => this.summarize(id)));
    return summaries.filter((summary): summary is CvSummary => summary !== null);
  }

  async getDocument(id: CvId): Promise<string | null> {
    if (!isValidCvId(id)) return null;
    try {
      return await readFile(this.documentPath(id), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  watch(listener: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher: FSWatcher = watch(this.cvsDir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(listener, WATCH_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }

  private async summarize(id: CvId): Promise<CvSummary | null> {
    try {
      const path = this.documentPath(id);
      const [html, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      return { id, title: readCvTitle(html) ?? id, updatedAt: info.mtime.toISOString() };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private documentPath(id: CvId): string {
    return join(this.cvsDir, id, DOCUMENT_FILE);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
