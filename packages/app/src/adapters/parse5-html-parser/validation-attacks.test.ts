import { templateCatalog } from '@markup-resume/styles';
import { describe, expect, it } from 'vitest';
import { validateResumeDocument } from '../../domain/index.ts';
import { parseHtml } from './parse-html.ts';

// The validation boundary with the real parser and template (ADR-0024): what an attacker writes is first read the
// way a browser reads it, so tricks that rely on the parser rearranging markup are seen as they would render.
const [ref] = templateCatalog.refs();
const example = templateCatalog.guide(ref!)!.example;

const validate = (html: string) => validateResumeDocument(html, templateCatalog, parseHtml);
const inHead = (snippet: string) => example.replace('</head>', `${snippet}\n</head>`);
const inPage = (snippet: string) =>
  example.replace('<main class="resume-page">', `<main class="resume-page">${snippet}`);

describe('the validation boundary against attacks, with parse5', () => {
  it('lets the template example through, as canonical HTML that is stable', () => {
    const result = validate(example);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') {
      return;
    }
    expect(validate(result.html)).toEqual(result);
  });

  it.each([
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
    ['a base href', '<base href="https://evil.example/">'],
    ['a stylesheet link', '<link rel="stylesheet" href="https://evil.example/x.css">'],
    ['a script', '<script>alert(1)</script>'],
    ['a style of its own', '<style>body { background: url(https://evil.example/t.png) }</style>'],
  ])('rejects %s in <head>', (_, snippet) => {
    expect(validate(inHead(snippet)).kind).toBe('invalid');
  });

  it.each([
    ['a script', '<script>alert(1)</script>'],
    ['a script split around another tag', '<scr<script>ipt>alert(1)</script>'],
    ['an event handler', '<p onclick="alert(1)">x</p>'],
    ['an event handler in odd case', '<p OnClIcK="alert(1)">x</p>'],
    ['a javascript link in odd case', '<a href="JaVaScRiPt:alert(1)">x</a>'],
    ['a javascript link hidden behind entities', '<a href="&#106;avascript:alert(1)">x</a>'],
    ['a data link', '<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">x</a>'],
    ['an iframe', '<iframe src="https://evil.example"></iframe>'],
    ['an iframe with srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['a form', '<form action="https://evil.example"><input name="password"></form>'],
    ['an SVG with a script', '<svg><script>alert(1)</script></svg>'],
    ['an image that errors into script', '<img src="x" onerror="alert(1)">'],
    ['an inline style', '<p style="background: url(https://evil.example/t.png)">x</p>'],
    [
      'a meta refresh moved into the page',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    ],
  ])('rejects %s in the page', (_, snippet) => {
    expect(validate(inPage(snippet)).kind).toBe('invalid');
  });

  it('sees a block the browser pushes out of a paragraph, as it renders', () => {
    // The browser closes the <p> before the <div>, so the div lands directly in the page, where it does not belong.
    const result = validate(inPage('<p>Text<div>Block</div></p>'));
    expect(result.kind).toBe('invalid');
  });
});
