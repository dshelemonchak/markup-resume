import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

  describe('save', () => {
    const historyDir = () => join(dataDir, 'cvs', 'sample', 'history');

    it('replaces the document and keeps the previous version in history', async () => {
      await addCv('sample', '<p>v1</p>');
      await repository.save('sample', '<p>v2</p>');

      expect(await repository.getDocument('sample')).toBe('<p>v2</p>');
      const history = await readdir(historyDir());
      expect(history).toHaveLength(1);
      expect(await readFile(join(historyDir(), history[0]!), 'utf8')).toBe('<p>v1</p>');
    });

    it('keeps only the newest versions, up to the history limit', async () => {
      repository = new FsCvRepository(dataDir, { historyLimit: 2 });
      await addCv('sample', '<p>v1</p>');
      for (const version of ['v2', 'v3', 'v4', 'v5']) await repository.save('sample', `<p>${version}</p>`);

      const history = (await readdir(historyDir())).sort();
      const contents = await Promise.all(history.map((name) => readFile(join(historyDir(), name), 'utf8')));
      expect(contents).toEqual(['<p>v3</p>', '<p>v4</p>']);
      expect(await repository.getDocument('sample')).toBe('<p>v5</p>');
    });

    it('leaves no temp files behind', async () => {
      await addCv('sample', '<p>v1</p>');
      await repository.save('sample', '<p>v2</p>');
      expect((await readdir(join(dataDir, 'cvs', 'sample'))).sort()).toEqual(['document.html', 'history']);
    });

    it('rejects unknown and invalid ids without creating anything', async () => {
      await expect(repository.save('missing', '<p></p>')).rejects.toThrow();
      await expect(repository.save('../outside', '<p></p>')).rejects.toThrow('Invalid CV id');
      expect(await readdir(join(dataDir, 'cvs'))).toEqual([]);
    });
  });

  describe('create', () => {
    it('stores a new CV that is then listed and read like any other', async () => {
      expect(await repository.create('fresh', '<meta name="cv:title" content="Fresh">')).toBe(true);
      expect(await repository.getDocument('fresh')).toBe('<meta name="cv:title" content="Fresh">');
      expect((await repository.list()).map(({ id, title }) => ({ id, title }))).toEqual([
        { id: 'fresh', title: 'Fresh' },
      ]);
      expect(await readdir(join(dataDir, 'cvs', 'fresh'))).toEqual(['document.html']);
    });

    it('leaves an existing CV untouched and reports false', async () => {
      await addCv('sample', '<p>v1</p>');
      expect(await repository.create('sample', '<p>other</p>')).toBe(false);
      expect(await repository.getDocument('sample')).toBe('<p>v1</p>');
      expect(await readdir(join(dataDir, 'cvs', 'sample'))).toEqual(['document.html']);
    });

    it('lets only one of two simultaneous creates succeed', async () => {
      const results = await Promise.all([
        repository.create('race', '<p>a</p>'),
        repository.create('race', '<p>b</p>'),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await repository.getDocument('race')).toBe(results[0] ? '<p>a</p>' : '<p>b</p>');
    });

    it('rejects an invalid id without creating anything', async () => {
      await expect(repository.create('../outside', '<p></p>')).rejects.toThrow('Invalid CV id');
      expect(await readdir(join(dataDir, 'cvs'))).toEqual([]);
    });
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
