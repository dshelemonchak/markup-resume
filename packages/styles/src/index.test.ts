import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontsDir, iconsDir, templateCatalog } from './index.ts';

describe('templateCatalog', () => {
  it('serves every listed template: its CSS, rules and example', () => {
    for (const ref of templateCatalog.refs()) {
      expect(templateCatalog.styles(ref)).toContain('.resume-page');
      const guide = templateCatalog.guide(ref);
      expect(guide?.rules).toContain(`version ${ref.split('@')[1]!}`);
      expect(guide?.example).toContain(`<meta name="resume:template" content="${ref}" />`);
    }
  });

  it('gives every template an ATS version: its own CSS with the one-column styles after it', () => {
    for (const ref of templateCatalog.refs()) {
      const ats = templateCatalog.styles(ref, 'ats');
      expect(ats?.startsWith(templateCatalog.styles(ref)!)).toBe(true);
      expect(ats).toContain('.resume-columns');
    }
    expect(templateCatalog.styles('classic@9.9.9', 'ats')).toBeNull();
  });

  it('knows nothing about other references', () => {
    expect(templateCatalog.styles('classic@9.9.9')).toBeNull();
    expect(templateCatalog.guide('modern@0.0.1')).toBeNull();
  });
});

describe('page limits in the rules for Claude', () => {
  /** The sizes the rules quote, read from the template's CSS, so that they cannot drift from it. */
  it('quote the template CSS: page margin, line heights, section gap, page size', () => {
    for (const ref of templateCatalog.refs()) {
      const css = templateCatalog.styles(ref)!;
      const rules = templateCatalog.guide(ref)!.rules;
      expect(rules, `${ref} has no Page limits`).toContain('## Page limits');
      for (const name of [
        '--resume-page-margin',
        '--resume-lh-body',
        '--resume-lh-tight',
        '--resume-lh-heading',
        '--resume-section-gap',
      ]) {
        const value = new RegExp(`${name}:\\s*(\\d+)px`).exec(css)?.[1];
        expect(value, `${ref} sets ${name}`).toBeDefined();
        expect(rules, `${ref} rules for ${name}`).toContain(`\`${name}\` ${value} px`);
      }
      // 989 px frame zoomed to the A4 width; the content area is the frame less the margins.
      const width = Number(/\.resume-page \{[^}]*?\bwidth:\s*(\d+)px/.exec(css)?.[1]);
      const margin = Number(/--resume-page-margin:\s*(\d+)px/.exec(css)?.[1]);
      const height = Math.round((width * 297) / 210);
      expect(rules).toContain(`${width} × ${height} px`);
      expect(rules).toContain(`${width - 2 * margin} × ${height - 2 * margin} px`);
    }
  });

  it('tell Claude what to cut: merge skills first, never shrink the type', () => {
    for (const ref of templateCatalog.refs()) {
      const rules = templateCatalog.guide(ref)!.rules;
      expect(rules).toContain('## When it does not fit');
      expect(rules).toContain('**Merge skills.**');
      expect(rules).toContain('Never shrink fonts');
    }
  });
});

describe('asset folders', () => {
  it('hold the fonts and icons the classic template loads', () => {
    const css = templateCatalog.styles('classic@0.0.4') ?? '';
    const urls = [...css.matchAll(/url\('\/api\/v1\/(fonts|icons)\/([\w.-]+)'\)/g)];
    expect(urls.length).toBeGreaterThan(0);
    for (const [, kind, file] of urls) {
      expect(existsSync(join(kind === 'fonts' ? fontsDir : iconsDir, file!)), file).toBe(true);
    }
  });
});
