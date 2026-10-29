import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CvId,
  type CvRepository,
  type CvSummary,
  isValidCvId,
  readCvTitle,
} from '../../domain/index.ts';

const DOCUMENT_FILE = 'document.html';
const HISTORY_DIR = 'history';
const DEFAULT_HISTORY_LIMIT = 3;

/**
 * CV storage on disk (ADR-0012): one folder per CV.
 *
 *   <dataDir>/cvs/<id>/document.html
 *   <dataDir>/cvs/<id>/history/<timestamp>.html   previous versions, newest `historyLimit` kept
 *
 * Folders whose name is not a valid id, or that have no document.html, are ignored.
 * The history is a safety net for overwrites, a first step towards revisions (ADR-0013).
 */
export class FsCvRepository implements CvRepository {
  private readonly cvsDir: string;
  private readonly historyLimit: number;

  constructor(dataDir: string, options: { historyLimit?: number } = {}) {
    this.cvsDir = join(dataDir, 'cvs');
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
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

  async save(id: CvId, html: string): Promise<void> {
    if (!isValidCvId(id)) throw new Error(`Invalid CV id: ${JSON.stringify(id)}`);
    const path = this.documentPath(id);
    // Copy the current version first: a crash after this point leaves an extra history entry, never a loss.
    await this.archive(id);
    // A rename within one file system replaces the target atomically, so the temp file sits next to it.
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, html, 'utf8');
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    await this.pruneHistory(id);
  }

  async create(id: CvId, html: string): Promise<boolean> {
    if (!isValidCvId(id)) throw new Error(`Invalid CV id: ${JSON.stringify(id)}`);
    const path = this.documentPath(id);
    await mkdir(join(this.cvsDir, id), { recursive: true });
    // Unlike rename, link never replaces the target: it fails with EEXIST, so creating is check-and-write
    // in one step, and the complete file appears at once.
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, html, 'utf8');
      await link(temp, path);
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) return false;
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
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

  private historyDir(id: CvId): string {
    return join(this.cvsDir, id, HISTORY_DIR);
  }

  /**
   * Copies the current document into history/. A plain sort of the file names is chronological:
   * "<stamp>.html", then "<stamp>_001.html" for copies made within the same millisecond ("_" sorts after ".").
   */
  private async archive(id: CvId): Promise<void> {
    const source = this.documentPath(id);
    // The existence check (rejects with ENOENT); it must run before mkdir creates a folder for an unknown id.
    await stat(source);
    const dir = this.historyDir(id);
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (let attempt = 0; ; attempt++) {
      const name = attempt === 0 ? `${stamp}.html` : `${stamp}_${String(attempt).padStart(3, '0')}.html`;
      try {
        await copyFile(source, join(dir, name), constants.COPYFILE_EXCL);
        return;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
    }
  }

  /** Deletes all but the newest `historyLimit` versions. */
  private async pruneHistory(id: CvId): Promise<void> {
    const dir = this.historyDir(id);
    const names = (await readdir(dir)).filter((name) => name.endsWith('.html')).sort();
    const stale = names.slice(0, Math.max(0, names.length - this.historyLimit));
    await Promise.all(stale.map((name) => rm(join(dir, name), { force: true })));
  }
}

function isNotFound(error: unknown): boolean {
  return hasCode(error, 'ENOENT');
}

function isAlreadyExists(error: unknown): boolean {
  return hasCode(error, 'EEXIST');
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
