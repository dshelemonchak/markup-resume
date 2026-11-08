# Template "classic" (version 0.0.3)

One A4 page: name and headline, a summary across the page, then a narrow sidebar (contacts, skills, education,
languages) next to the main column (experience). The design comes from the template; the document only holds
content and the class names below.

## The document

- `<head>` keeps `<meta charset="utf-8">`, `<title>`, `<meta name="resume:title">` and
  `<meta name="resume:template" content="classic@0.0.3">`.
- Do not write CSS. Markup Résumé inserts the template's styles as `<style id="resume-lib">` on every save; send it back
  unchanged or leave it out. No `style` attributes, scripts, images or external resources.
- Use only the classes listed here, on the elements and in the nesting shown. Sections may be left out; their
  order inside a column may change.
- Markup Résumé checks the markup on every save: an unknown class, a class on the wrong element or in the wrong place,
  or anything outside the page is rejected, and the error lists each problem to fix.
- Elements without a class: only `p`, `ul`, `li`, `a`, `strong`, `time`, `h3` and `span`, as in the blocks below.
  Links go to `https://`, `mailto:` or `tel:` addresses.

## Structure

```
main.resume-page
├── header.resume-header
│   ├── h1.resume-name                      full name
│   └── p.resume-headline                   "Role · Location · Remote"
├── section.resume-summary                  h2.resume-summary-header, then one or more p
└── div.resume-columns
    ├── aside.resume-sidebar
    │   ├── section.resume-contacts         h2.resume-contacts-header, then ul.resume-contact-list
    │   ├── section.resume-skills           h2.resume-skills-header, then div.resume-skill-group …
    │   ├── section.resume-education        h2.resume-education-header, then article.resume-school …
    │   └── section.resume-languages        h2.resume-languages-header, then ul.resume-language-list
    └── div.resume-main
        └── section.resume-experience       h2.resume-experience-header, then article.resume-employer …
```

Every section starts with its heading: an `<h2>` with the section's own header class, e.g.
`<h2 class="resume-skills-header">Skills</h2>`. Its text is the section title.

## Blocks

**Contacts** — one `li.resume-contact` per contact, with exactly one kind class that picks the icon, and a link:

```html
<li class="resume-contact resume-contact-email"><a href="mailto:name@example.com">name@example.com</a></li>
```

Kinds: `resume-contact-email`, `resume-contact-phone`, `resume-contact-linkedin`, `resume-contact-github`, `resume-contact-telegram`,
`resume-contact-website`, `resume-contact-location` (location: plain text in a `<span>` instead of a link). Show web
links without `https://`.

**Skills** — groups of a `<h3>` title and a bulleted list. Wrap the skills that matter most for the vacancy in
`<strong>`.

```html
<div class="resume-skill-group">
  <h3>Frontend</h3>
  <ul class="resume-skill-list">
    <li><strong>Angular</strong></li>
    <li>RxJS</li>
  </ul>
</div>
```

**Education** — one `article.resume-school` per institution, one `div.resume-degree` per degree, newest first:

```html
<article class="resume-school">
  <h3 class="resume-school-name">University name</h3>
  <div class="resume-degree">
    <p class="resume-dates">
      <time datetime="2014-09">September 2014</time> - <time datetime="2016-06">June 2016</time>
    </p>
    <p class="resume-degree-name">Master's degree, Computer Science</p>
  </div>
</article>
```

**Experience** — one `article.resume-employer` per employer, one `div.resume-project` per role or project there, newest
first. Each achievement is one `<li>`, starting with a short bold lead that ends with a colon:

```html
<article class="resume-employer">
  <div class="resume-employer-header">
    <h3 class="resume-employer-name">Company - remote</h3>
    <p class="resume-dates"><time datetime="2019-03">March 2019</time> - Present</p>
  </div>
  <div class="resume-project">
    <div class="resume-project-header">
      <p class="resume-dates"><time datetime="2021-05">May 2021</time> - Present</p>
      <h4 class="resume-role">Senior Frontend Engineer</h4>
      <p class="resume-domain">Industry · Product</p>
    </div>
    <ul class="resume-achievements">
      <li><strong>Lead:</strong> what was done and its result.</li>
    </ul>
  </div>
</article>
```

**Languages** — `ul.resume-language-list`, one `<li>` per language: `English (C1)`.

## Text

- Dates: full month name and year, joined by `" - "`; `Present` for ongoing work. Each date in
  `<time datetime="YYYY-MM">`.
- Plain text only: no emoji, icon characters or decorative symbols; `·` separates parts of the headline and
  domain lines.
- `<strong>` is the only inline emphasis.
