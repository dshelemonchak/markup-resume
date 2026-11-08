# Template "dev-classic" (version 0.0.2)

The "classic" design with a section for developers' own projects: name and headline, a summary across the page, then
a narrow sidebar (contacts, skills, education, languages) next to the main column (experience, then open source). The design comes from the template; the document only holds
content and the class names below.

## The document

- `<head>` keeps `<meta charset="utf-8">`, `<title>`, `<meta name="resume:title">` and
  `<meta name="resume:template" content="dev-classic@0.0.2">`.
- Do not write CSS. Markup Résumé inserts the template's styles as `<style id="resume-lib">` on every save; send it back
  unchanged or leave it out. No `style` attributes, scripts, images or external resources.
- The CV must fit one A4 page; see Page limits at the end for the sizes and what to cut.
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
        ├── section.resume-experience       h2.resume-experience-header, then article.resume-employer …
        └── section.resume-projects         h2.resume-projects-header, then article.resume-employer …
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

**Open source** — `section.resume-projects`, after the experience: your own projects, kept apart from employment so
applicant tracking systems do not read them as a job. Each project is an `article.resume-employer` like an employer:
the project and its link in `h3.resume-employer-name`, your role (e.g. "Creator & Maintainer") in `h4.resume-role`,
what it is in `p.resume-domain`. Give the dates once, in the employer header.

```html
<section class="resume-projects">
  <h2 class="resume-projects-header">Open Source</h2>
  <article class="resume-employer">
    <div class="resume-employer-header">
      <h3 class="resume-employer-name">Project name - github.com/you/project</h3>
      <p class="resume-dates"><time datetime="2026-10">October 2026</time> - Present</p>
    </div>
    <div class="resume-project">
      <div class="resume-project-header">
        <h4 class="resume-role">Creator &amp; Maintainer</h4>
        <p class="resume-domain">What it is · Stack</p>
      </div>
      <ul class="resume-achievements">
        <li><strong>Lead:</strong> what was done.</li>
      </ul>
    </div>
  </article>
</section>
```

**Languages** — `ul.resume-language-list`, one `<li>` per language: `English (C1)`.

## Text

- Dates: full month name and year, joined by `" - "`; `Present` for ongoing work. Each date in
  `<time datetime="YYYY-MM">`.
- Plain text only: no emoji, icon characters or decorative symbols; `·` separates parts of the headline and
  domain lines.
- `<strong>` is the only inline emphasis.

## Page limits

The CV is **one A4 page**. What does not fit prints on a second page, and the Markup Résumé viewer then shows a red
shadow along the bottom of the CV. A CV with that shadow is not finished: shorten it. You cannot see the page, so
add up the heights below before you save, and cut until the sum fits.

Sizes are in design px, the unit of the template's CSS (1 px = 0.8028 CSS px = 0.2124 mm).

- Page: A4, 210 × 297 mm = 989 × 1399 px. Margin on every side: `--resume-page-margin` 40 px.
- Content area: 909 × 1319 px. The summary spans all 909 px, about 120 characters per line.
- Main column: 571 px wide, lists inside it 550 px, about 75 characters per line.
- Sidebar: 300 px wide, lists inside it 279 px, about 38 characters per line. A longer skill wraps to a second line.
- Text line: `--resume-lh-body` 20 px. Tight line (employer, school, dates in the employer header): `--resume-lh-tight` 17 px.
- Section heading line: `--resume-lh-heading` 24 px. Gap between sections in a column: `--resume-section-gap` 29 px.

Character counts are for ordinary English text; names, numbers and capitals are wider, so leave a margin.

**Height budget.** The top of the page costs 71 px (name and headline) + 23 + 38 (summary heading) + 20 per summary
line (+ 6 between paragraphs) + 29 before the columns. Each column then has `1158 − 20 × summary lines` px: 1098 px for
a three-line summary. The sidebar and the main column are separate: each must fit on its own, the taller one decides.
Keep about 60 px spare.

**Sidebar blocks**

- Contacts: 36 + 28 per contact − 8 px.
- Skills: 37 px + per group 20 (title) + 20 per list item, 20 between groups. Several skills may share one `<li>`
  (see below): that costs 20 px, not 20 px per skill.
- Education: 36 px + per school 17 + per degree 59 (one line of degree name; 20 more per extra line).
- Languages: 36 + 28 per language − 8 px.
- 29 px between sections.

**Main column blocks**

- Section heading, for experience and for open source: 51 px (`<h2>` and the gap under it).
- Employer: 34 px header + 31 + its projects. A project costs 73 px + 20 per line of achievements; 23 px between
  projects, 29 px between employers. An achievement of 150 characters takes two lines, 40 px.
- An open-source project is an employer block: the same costs.
- An employer with one project and four two-line achievements: 34 + 31 + 73 + 160 = 298 px.

## When it does not fit

Never shrink fonts, spacing or margins and never write CSS or `style` attributes: the template fixes them. Cut content.
Take these steps in order, and stop as soon as the budget fits:

1. **Merge skills.** One `<li>` per group of related skills, separated by commas, instead of one `<li>` per skill:
   `<li><strong>Angular</strong>, TypeScript, RxJS, Signals</li>` is 20 px; four items on their own lines are 80 px.
   Fill a line to about 38 characters, and fold small groups into one: a group costs 40 px before its first skill
   (title and gap). Keep `<strong>` on the skills the vacancy asks for.
2. **Shorten achievements** to one line, 75 characters, each with its result. Drop the second sentence first.
3. **Remove the least relevant content**, from the least important up: minor skills (the ones the vacancy does not
   mention), the weakest achievements of recent roles (keep 3 to 5 per role), all but one or two achievements of
   older roles, the oldest or least relevant roles, then a second summary paragraph (keep two or three lines).
4. Sections may be left out (education or languages); do it last.

What stays: name, headline, contacts, every employer you keep with its dates, and the achievements that match the
vacancy. Do not drop a line only because it is long; drop it because it matters least for this CV.

After saving, tell the user what you merged or removed, so they can bring something back.
