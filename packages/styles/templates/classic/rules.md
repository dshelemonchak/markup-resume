# Template "classic" (version 0.0.2)

One A4 page: name and headline, a summary across the page, then a narrow sidebar (contacts, skills, education)
next to the main column (experience, languages). The design comes from the template; the document only holds
content and the class names below.

## The document

- `<head>` keeps `<meta charset="utf-8">`, `<title>`, `<meta name="cv:title">` and
  `<meta name="cv:template" content="classic@0.0.2">`.
- Do not write CSS. Markup Résumé inserts the template's styles as `<style id="cv-lib">` on every save; send it back
  unchanged or leave it out. No `style` attributes, scripts, images or external resources.
- Use only the classes listed here, on the elements and in the nesting shown. Sections may be left out; their
  order inside a column may change.
- Markup Résumé checks the markup on every save: an unknown class, a class on the wrong element or in the wrong place,
  or anything outside the page is rejected, and the error lists each problem to fix.
- Elements without a class: only `p`, `ul`, `li`, `a`, `strong`, `time`, `h3` and `span`, as in the blocks below.
  Links go to `https://`, `mailto:` or `tel:` addresses.

## Structure

```
main.cv-page
├── header.cv-header
│   ├── h1.cv-name                      full name
│   └── p.cv-headline                   "Role · Location · Remote"
├── section.cv-summary                  h2.cv-summary-header, then one or more p
└── div.cv-columns
    ├── aside.cv-sidebar
    │   ├── section.cv-contacts         h2.cv-contacts-header, then ul.cv-contact-list
    │   ├── section.cv-skills           h2.cv-skills-header, then div.cv-skill-group …
    │   └── section.cv-education        h2.cv-education-header, then article.cv-school …
    └── div.cv-main
        ├── section.cv-experience       h2.cv-experience-header, then article.cv-employer …
        └── section.cv-languages        h2.cv-languages-header, then ul.cv-language-list
```

Every section starts with its heading: an `<h2>` with the section's own header class, e.g.
`<h2 class="cv-skills-header">Skills</h2>`. Its text is the section title.

## Blocks

**Contacts** — one `li.cv-contact` per contact, with exactly one kind class that picks the icon, and a link:

```html
<li class="cv-contact cv-contact-email"><a href="mailto:name@example.com">name@example.com</a></li>
```

Kinds: `cv-contact-email`, `cv-contact-phone`, `cv-contact-linkedin`, `cv-contact-github`, `cv-contact-telegram`,
`cv-contact-website`, `cv-contact-location` (location: plain text in a `<span>` instead of a link). Show web
links without `https://`.

**Skills** — groups of a `<h3>` title and a bulleted list. Wrap the skills that matter most for the vacancy in
`<strong>`.

```html
<div class="cv-skill-group">
  <h3>Frontend</h3>
  <ul class="cv-skill-list">
    <li><strong>Angular</strong></li>
    <li>RxJS</li>
  </ul>
</div>
```

**Education** — one `article.cv-school` per institution, one `div.cv-degree` per degree, newest first:

```html
<article class="cv-school">
  <h3 class="cv-school-name">University name</h3>
  <div class="cv-degree">
    <p class="cv-dates">
      <time datetime="2014-09">September 2014</time> - <time datetime="2016-06">June 2016</time>
    </p>
    <p class="cv-degree-name">Master's degree, Computer Science</p>
  </div>
</article>
```

**Experience** — one `article.cv-employer` per employer, one `div.cv-project` per role or project there, newest
first. Each achievement is one `<li>`, starting with a short bold lead that ends with a colon:

```html
<article class="cv-employer">
  <div class="cv-employer-header">
    <h3 class="cv-employer-name">Company - remote</h3>
    <p class="cv-dates"><time datetime="2019-03">March 2019</time> - Present</p>
  </div>
  <div class="cv-project">
    <div class="cv-project-header">
      <p class="cv-dates"><time datetime="2021-05">May 2021</time> - Present</p>
      <h4 class="cv-role">Senior Frontend Engineer</h4>
      <p class="cv-domain">Industry · Product</p>
    </div>
    <ul class="cv-achievements">
      <li><strong>Lead:</strong> what was done and its result.</li>
    </ul>
  </div>
</article>
```

**Languages** — `ul.cv-language-list`, one `<li>` per language: `English (C1)`.

## Text

- Dates: full month name and year, joined by `" - "`; `Present` for ongoing work. Each date in
  `<time datetime="YYYY-MM">`.
- Plain text only: no emoji, icon characters or decorative symbols; `·` separates parts of the headline and
  domain lines.
- `<strong>` is the only inline emphasis.
