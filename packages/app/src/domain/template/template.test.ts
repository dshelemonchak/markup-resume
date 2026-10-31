import { describe, expect, it } from 'vitest';
import { type TemplateCatalog, withTemplateStyles } from './template.ts';

const catalog: TemplateCatalog = {
  refs: () => ['classic@0.0.3'],
  styles: (ref) => (ref === 'classic@0.0.3' ? 'body { color: red; }' : null),
  guide: () => null,
  schema: () => null,
};

const doc = (head: string) =>
  `<!doctype html>\n<html>\n  <head>\n${head}  </head>\n  <body></body>\n</html>\n`;
const template = '    <meta name="resume:template" content="classic@0.0.3" />\n';

describe('withTemplateStyles', () => {
  it('inserts the template CSS at the end of the head', () => {
    expect(withTemplateStyles(doc(template), catalog)).toEqual({
      kind: 'styled',
      html: doc(
        `${template}    <style id="resume-lib" data-resume-lib="classic@0.0.3">\nbody { color: red; }\n    </style>\n`,
      ),
    });
  });

  it('replaces whatever the sender put into resume-lib, so saving twice gives the same document', () => {
    const sent = doc(`${template}    <style id="resume-lib">h1 { color: blue; }</style>\n`);
    const once = withTemplateStyles(sent, catalog);
    expect(once.kind).toBe('styled');
    if (once.kind !== 'styled') return;
    expect(once.html).not.toContain('color: blue');
    expect(withTemplateStyles(once.html, catalog)).toEqual(once);
  });

  it('leaves a document without resume:template as it is', () => {
    const html = doc('    <style id="resume-lib">h1 {}</style>\n');
    expect(withTemplateStyles(html, catalog)).toEqual({ kind: 'styled', html });
  });

  it('names the known templates when the reference is unknown', () => {
    const html = doc('    <meta name="resume:template" content="modern@3" />\n');
    expect(withTemplateStyles(html, catalog)).toEqual({
      kind: 'problem',
      problem: 'Unknown template "modern@3" in resume:template; use one of: "classic@0.0.3".',
    });
  });

  it('needs a head to put the styles in', () => {
    const html = '<!doctype html><meta name="resume:template" content="classic@0.0.3"><p>no head</p></html>';
    expect(withTemplateStyles(html, catalog)).toMatchObject({ kind: 'problem' });
  });
});
