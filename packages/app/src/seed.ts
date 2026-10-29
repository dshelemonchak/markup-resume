// Composition root for `pnpm seed`: puts the classic template's example CV (fictional) into the data
// directory, so a fresh checkout has something to show. It goes through the same use case as Claude's
// create_cv, so the template's styles are inserted and its markup is checked. Never overwrites a CV.
//   CV_DATA_DIR  data directory (default ./data)
import { templateCatalog } from '@markup-resume/styles';
import { resolve } from 'node:path';
import { parseMarkup } from './adapters/html-parse5/parse-markup.ts';
import { FsCvRepository } from './adapters/storage-fs/fs-cv-repository.ts';
import { createCvDocument, CvChanges } from './app/index.ts';

const SAMPLE_ID = 'sample';

const dataDir = resolve(process.env['CV_DATA_DIR'] ?? 'data');
const repository = new FsCvRepository(dataDir);
await repository.init();

const [ref] = templateCatalog.refs();
const example = ref ? templateCatalog.guide(ref)?.example : undefined;
if (!example) throw new Error('The style library has no template with an example');

const result = await createCvDocument(
  { repository, templates: templateCatalog, parseMarkup, cvChanges: new CvChanges() },
  SAMPLE_ID,
  example,
);
switch (result.kind) {
  case 'created':
    console.log(`Seeded "${SAMPLE_ID}" from the ${ref} example in ${dataDir}`);
    break;
  case 'already-exists':
    console.log(`A CV "${SAMPLE_ID}" is already there, left untouched.`);
    break;
  default:
    throw new Error(`The ${ref} example was rejected: ${JSON.stringify(result)}`);
}
