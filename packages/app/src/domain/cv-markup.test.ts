import { describe, expect, it } from 'vitest';
import { checkMarkup, type MarkupElement, type MarkupSchema } from './cv-markup.ts';

const schema: MarkupSchema = {
  plainElements: ['p', 'ul', 'li', 'a', 'strong'],
  classes: {
    'cv-page': { tags: ['main'], parents: [] },
    'cv-skills': { tags: ['section'], parents: ['cv-page'], first: 'cv-skills-header' },
    'cv-skills-header': { tags: ['h2'], parents: ['cv-skills'] },
    'cv-contact': { tags: ['li'], parents: ['cv-skills'], oneOf: ['cv-contact-email', 'cv-contact-phone'] },
  },
};

/** An element; `classes` becomes the class attribute. */
function el(tag: string, classes = '', ...children: MarkupElement[]): MarkupElement {
  return { tag, attributes: new Map(classes ? [['class', classes]] : []), children };
}

function withAttributes(element: MarkupElement, attributes: Record<string, string>): MarkupElement {
  return { ...element, attributes: new Map([...element.attributes, ...Object.entries(attributes)]) };
}

const header = () => el('h2', 'cv-skills-header');
const doc = (head: MarkupElement[], ...page: MarkupElement[]) =>
  el('html', '', el('head', '', ...head), el('body', '', el('main', 'cv-page', ...page)));

describe('checkMarkup', () => {
  it('accepts a page built by the schema', () => {
    const page = doc(
      [el('meta'), el('title'), withAttributes(el('style'), { id: 'cv-lib' })],
      el(
        'section',
        'cv-skills',
        header(),
        el('p', '', el('strong'), withAttributes(el('a'), { href: 'https://x' })),
      ),
      el('section', 'cv-skills', header(), el('li', 'cv-contact cv-contact-email')),
    );
    expect(checkMarkup(page, schema)).toEqual([]);
  });

  it('names unknown classes, wrong tags and wrong parents', () => {
    const page = doc(
      [],
      el('section', 'cv-skills', el('p', 'cv-skills-header'), el('p', 'cv-skill-title')),
      el('h2', 'cv-skills-header'),
    );
    expect(checkMarkup(page, schema)).toEqual([
      '.cv-skills-header goes on <h2>, not on <p>.',
      'Unknown class "cv-skill-title" on <p in .cv-skills>; use only the classes from read_template.',
      '.cv-skills-header is inside .cv-page; it belongs in .cv-skills.',
    ]);
  });

  it('needs exactly one kind class where the schema asks for one', () => {
    const page = doc(
      [],
      el(
        'section',
        'cv-skills',
        header(),
        el('li', 'cv-contact'),
        el('li', 'cv-contact cv-contact-email cv-contact-phone'),
      ),
    );
    expect(checkMarkup(page, schema)).toEqual([
      '.cv-contact in .cv-skills needs exactly one kind class: cv-contact-email, cv-contact-phone.',
      '.cv-contact in .cv-skills needs exactly one kind class: cv-contact-email, cv-contact-phone.',
    ]);
  });

  it('keeps out scripts, images, other styles, inline styles, handlers and odd links', () => {
    const page = doc(
      [el('style'), el('script')],
      el(
        'section',
        'cv-skills',
        header(),
        el('img'),
        el('script'),
        withAttributes(el('p'), { style: 'color: red', onclick: 'x()' }),
        withAttributes(el('a'), { href: 'javascript:alert(1)' }),
      ),
    );
    expect(checkMarkup(page, schema)).toEqual([
      '<style> is not allowed: the template does all the styling (cv-kit adds <style id="cv-lib">).',
      '<script> is not allowed in <head>.',
      '<img in .cv-skills> is not allowed.',
      '<script in .cv-skills> is not allowed.',
      'The style attribute on <p in .cv-skills> is not allowed: the template does the styling.',
      'The onclick attribute on <p in .cv-skills> is not allowed.',
      'The link "javascript:alert(1)" in .cv-skills must start with https://, mailto: or tel:.',
    ]);
  });

  it('wants the whole body inside one page element', () => {
    const page = el('html', '', el('head'), el('body', '', el('main', 'cv-page'), el('p')));
    expect(checkMarkup(page, schema)).toEqual([
      '<body> must hold exactly one element: the page, <main class="cv-page">.',
      '<p> is outside the page; everything goes inside <main class="cv-page">.',
    ]);
  });

  it('wants a section to open with its heading', () => {
    const page = doc([], el('section', 'cv-skills', el('p'), header()));
    expect(checkMarkup(page, schema)).toEqual([
      '.cv-skills must start with its heading, <h2 class="cv-skills-header">.',
    ]);
  });

  it('asks for a class on a tag the template uses only with one', () => {
    const page = doc([], el('section', 'cv-skills', header(), el('h2')));
    expect(checkMarkup(page, schema)).toEqual(['<h2 in .cv-skills> needs a class from the template.']);
  });
});
