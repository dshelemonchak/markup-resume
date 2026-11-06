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
  it('moves education and languages after the experience in the ATS version only', () => {
    const page = (sidebar: string, main: string) =>
      doc(template).replace(
        '<body></body>',
        `<body><main class="resume-page"><div class="resume-columns"><aside class="resume-sidebar">${sidebar}</aside><div class="resume-main">${main}</div></div></main></body>`,
      );
    const html = page(
      '<section class="resume-contacts">C</section><section class="resume-education">E</section><section class="resume-skills">S</section><section class="resume-languages">L</section>',
      '<section class="resume-experience">X</section><section class="resume-projects">P</section>',
    );
    const order = (result: ReturnType<typeof withTemplateStyles>) =>
      result.kind === 'styled'
        ? [...result.html.matchAll(/class="resume-(\w+)">/g)].map((m) => m[1]).join(',')
        : '';
    expect(order(withTemplateStyles(html, catalog))).toBe(
      'page,columns,sidebar,contacts,education,skills,languages,main,experience,projects',
    );
    expect(order(withTemplateStyles(html, catalog, 'ats'))).toBe(
      'page,columns,sidebar,contacts,skills,main,experience,projects,education,languages',
    );
  });

  it('writes the skills as comma-separated lines in the ATS version only', () => {
    const html = doc(template).replace(
      '<body></body>',
      '<body><ul class="resume-skill-list"><li><strong>Angular</strong></li> <li>RxJS</li></ul></body>',
    );
    const ats = withTemplateStyles(html, catalog, 'ats');
    expect(ats.kind === 'styled' && ats.html).toContain(
      '<li><strong>Angular</strong>,</li> <li>RxJS</li></ul>',
    );
    const visual = withTemplateStyles(html, catalog);
    expect(visual.kind === 'styled' && visual.html).not.toContain(',</li>');
  });

  it('keeps a space after each ATS skill comma when the items are written without one', () => {
    const html = doc(template).replace(
      '<body></body>',
      '<body><ul class="resume-skill-list"><li>React, TypeScript</li><li>Angular</li><li>RxJS</li></ul></body>',
    );
    const ats = withTemplateStyles(html, catalog, 'ats');
    expect(ats.kind === 'styled' && ats.html).toContain(
      '<li>React, TypeScript,</li> <li>Angular,</li> <li>RxJS</li></ul>',
    );
  });

  it('inserts the ATS styles for the ATS version, and refuses a template without one', () => {
    const withAts: TemplateCatalog = {
      ...catalog,
      styles: (ref, variant = 'visual') =>
        ref === 'classic@0.0.3' ? (variant === 'ats' ? 'body {} .ats {}' : 'body {}') : null,
    };
    const ats = withTemplateStyles(doc(template), withAts, 'ats');
    expect(ats.kind === 'styled' && ats.html).toContain('body {} .ats {}');
    const noAts: TemplateCatalog = {
      ...catalog,
      styles: (ref, variant = 'visual') => (variant === 'ats' ? null : catalog.styles(ref)),
    };
    expect(withTemplateStyles(doc(template), noAts, 'ats')).toEqual({
      kind: 'problem',
      problem: 'The template "classic@0.0.3" has no ATS version.',
    });
  });

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
