import { describe, expect, it } from 'vitest';
import { type TemplateCatalog, withTemplateStyles } from './cv-template.ts';

const catalog: TemplateCatalog = {
  refs: () => ['classic@0.0.1'],
  styles: (ref) => (ref === 'classic@0.0.1' ? 'body { color: red; }' : null),
  guide: () => null,
};

const doc = (head: string) =>
  `<!doctype html>\n<html>\n  <head>\n${head}  </head>\n  <body></body>\n</html>\n`;
const template = '    <meta name="cv:template" content="classic@0.0.1" />\n';

describe('withTemplateStyles', () => {
  it('inserts the template CSS at the end of the head', () => {
    expect(withTemplateStyles(doc(template), catalog)).toEqual({
      kind: 'styled',
      html: doc(
        `${template}    <style id="cv-lib" data-cv-lib="classic@0.0.1">\nbody { color: red; }\n    </style>\n`,
      ),
    });
  });

  it('replaces whatever the sender put into cv-lib, so saving twice gives the same document', () => {
    const sent = doc(`${template}    <style id="cv-lib">h1 { color: blue; }</style>\n`);
    const once = withTemplateStyles(sent, catalog);
    expect(once.kind).toBe('styled');
    if (once.kind !== 'styled') return;
    expect(once.html).not.toContain('color: blue');
    expect(withTemplateStyles(once.html, catalog)).toEqual(once);
  });

  it('leaves a document without cv:template as it is', () => {
    const html = doc('    <style id="cv-lib">h1 {}</style>\n');
    expect(withTemplateStyles(html, catalog)).toEqual({ kind: 'styled', html });
  });

  it('names the known templates when the reference is unknown', () => {
    const html = doc('    <meta name="cv:template" content="modern@3" />\n');
    expect(withTemplateStyles(html, catalog)).toEqual({
      kind: 'problem',
      problem: 'Unknown template "modern@3" in cv:template; use one of: "classic@0.0.1".',
    });
  });

  it('needs a head to put the styles in', () => {
    const html = '<!doctype html><meta name="cv:template" content="classic@0.0.1"><p>no head</p></html>';
    expect(withTemplateStyles(html, catalog)).toMatchObject({ kind: 'problem' });
  });
});
