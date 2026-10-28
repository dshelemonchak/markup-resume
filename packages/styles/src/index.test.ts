import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontsDir, iconsDir, templateCatalog } from './index.ts';

describe('templateCatalog', () => {
  it('serves every listed template: its CSS, rules and example', () => {
    for (const ref of templateCatalog.refs()) {
      expect(templateCatalog.styles(ref)).toContain('.cv-page');
      const guide = templateCatalog.guide(ref);
      expect(guide?.rules).toContain(`version ${ref.split('@')[1]!}`);
      expect(guide?.example).toContain(`<meta name="cv:template" content="${ref}" />`);
    }
  });

  it('knows nothing about other references', () => {
    expect(templateCatalog.styles('classic@9.9.9')).toBeNull();
    expect(templateCatalog.guide('modern@0.0.1')).toBeNull();
  });
});

describe('asset folders', () => {
  it('hold the fonts and icons the classic template loads', () => {
    const css = templateCatalog.styles('classic@0.0.1') ?? '';
    const urls = [...css.matchAll(/url\('\/api\/v1\/(fonts|icons)\/([\w.-]+)'\)/g)];
    expect(urls.length).toBeGreaterThan(0);
    for (const [, kind, file] of urls) {
      expect(existsSync(join(kind === 'fonts' ? fontsDir : iconsDir, file!)), file).toBe(true);
    }
  });
});
