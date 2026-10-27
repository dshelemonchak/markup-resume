import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsCvRepository } from './fs-cv-repository.ts';

let dataDir: string;
let repository: FsCvRepository;

async function addCv(id: string, html: string): Promise<void> {
  await mkdir(join(dataDir, 'cvs', id), { recursive: true });
  await writeFile(join(dataDir, 'cvs', id, 'document.html'), html);
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'cv-repo-'));
  repository = new FsCvRepository(dataDir);
  await repository.init();
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('FsCvRepository', () => {
  it('lists CV folders with a document, titled from cv:title or the id', async () => {
    await addCv('titled', '<meta name="cv:title" content="Titled CV">');
    await addCv('untitled', '<p>no meta</p>');
    await mkdir(join(dataDir, 'cvs', 'empty-folder'));
    await mkdir(join(dataDir, 'cvs', 'Not_Valid'));

    const cvs = await repository.list();
    expect(cvs.map(({ id, title }) => ({ id, title })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'titled', title: 'Titled CV' },
      { id: 'untitled', title: 'untitled' },
    ]);
    expect(Number.isNaN(Date.parse(cvs[0]!.updatedAt))).toBe(false);
  });

  it('reads a document and returns null for missing or invalid ids', async () => {
    await addCv('sample', '<html>sample</html>');
    expect(await repository.getDocument('sample')).toBe('<html>sample</html>');
    expect(await repository.getDocument('missing')).toBeNull();
    expect(await repository.getDocument('../outside')).toBeNull();
  });

  it('notifies once per burst of changes', async () => {
    let calls = 0;
    const stop = repository.watch(() => calls++);
    await addCv('watched', '<p>1</p>');
    await writeFile(join(dataDir, 'cvs', 'watched', 'document.html'), '<p>2</p>');
    await new Promise((resolve) => setTimeout(resolve, 400));
    stop();
    expect(calls).toBe(1);
  });
});
