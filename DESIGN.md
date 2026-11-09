# DESIGN.md

Visual direction of the Markup Résumé UI (not the CV templates: those live in `packages/styles/templates/`). The
reference mockups are a Claude Design canvas kept outside the repository; this file is the part of them that the
code follows. Tokens are defined once, in `packages/web/src/styles/_theme.scss`.

## Read

A signed-in web tool for people who keep several CVs and edit them through Claude. Calm and native-feeling: the CV
sheet is the loudest thing on screen, the chrome around it stays quiet.

- Light theme by default; the dark theme follows the system setting and keeps the existing graphite greys.
- Energy 1, rhythm 2, motion 1 (the landing page goes to energy 2).
- **Identity motif:** the revision tag `slug@number`, set in monospace wherever a CV is referenced. It is what links
  an application to the exact CV that was sent.
- Placeholder data in mockups is written in brackets (`[Company]`, `[n]`); the UI never shows invented numbers,
  names or testimonials.

## Color

One neutral slate scale plus one accent. The only second hue is the destructive red, used for irreversible actions.

| Role                    | Light                  | Notes                                                 |
| ----------------------- | ---------------------- | ----------------------------------------------------- |
| Ground (app background) | `#eef1f6`              | flat, no glows or blurred blobs                       |
| Panel                   | `#ffffff`              | solid surfaces; glass surfaces are described below    |
| Ink                     | `#0f172a`              | headings and body text                                |
| Secondary text          | `#334155`              |                                                       |
| Muted text              | `#556274`              | the lightest text allowed: 5.7:1 on the ground        |
| Border, control         | `#cbd5e1`              |                                                       |
| Hairline                | `rgb(15 23 42 / 0.08)` | separators between areas                              |
| **Accent (indigo ink)** | `#4338ca`              | links, focus ring, primary fill; white text 7.9:1     |
| Accent hover            | `#3730a3`              |                                                       |
| Accent pressed          | `#2e2a8a`              |                                                       |
| Accent, gradient top    | `#5048e0`              | top of the primary button gradient                    |
| Selected fill           | `#eef2ff`              | selected rows and list items; accent text on it 7.1:1 |
| Selected border         | `#c7d2fe`              |                                                       |
| Destructive             | `#b42318`              | delete only                                           |
| Success                 | `#17663a` on `#e3f4ea` | valid, offer, connected                               |
| Connected dot           | `#1f9d55`              |                                                       |

Indigo was chosen over Bootstrap's blue: still a blue family, so links read as links, but no longer the default
look. On dark surfaces the accent lightens to `#a5b4fc`.

### Application status chips

| Status    | Style                                  |
| --------- | -------------------------------------- |
| Saved     | dashed border, muted text              |
| Applied   | slate fill                             |
| Interview | `#e0e7ff` fill, `#3730a3` text (8.1:1) |
| Offer     | `#e3f4ea` fill, `#17663a` text         |
| Rejected  | slate fill, muted text                 |
| No reply  | slate fill, muted text                 |

### Tag dots

CV list items carry 1 to 3 dots for their tags, stacked vertically on the left; a CV without tags shows one gray
dot. Dots are 8 px with an inset ring `rgb(15 23 42 / 0.18)`, so light colors stay visible on white.

| Tag        | Color     |
| ---------- | --------- |
| Angular    | `#dd0031` |
| React      | `#61dafb` |
| Java       | `#e76f00` |
| Node       | `#5fa04e` |
| TypeScript | `#3178c6` |
| none       | `#cbd5e1` |

## Typography

- **UI:** Schibsted Grotesk 400/500/600/700. Chosen for character: a grotesk with a newspaper background, not one
  of the default AI-generated picks (Inter, Geist, Space Grotesk).
- **Mono:** DM Mono 400/500, for `slug@number`, file names and template versions.
- **CV sheet:** Inter, as the templates define. The UI font never reaches the CV.
- Sizes: 24 page title, 18 section, 16 card title, 14 body and controls, 13 secondary, 12 captions and chips.
- No uppercase labels with wide tracking, no monospace headings.

## Surfaces

### Glass

Frosted glass gives the app its volume; the owner keeps it on several chrome surfaces (an override of the
"one or two glass elements" rule). It only reads where real content passes behind it, so it sits on chrome that
overlaps content: the header, the sidebars, the status bar, menus, and the landing page header and revision card.

- Panel: `rgb(255 255 255 / 0.62)`, `backdrop-filter: blur(26px) saturate(160%)`, border
  `rgb(255 255 255 / 0.65)`, shadow `inset 0 1px 0 rgb(255 255 255 / 0.9), 0 1px 2px rgb(15 23 42 / 0.06),
0 10px 28px rgb(15 23 42 / 0.12)`.
- Bar (the app header; sticky on the landing page): `rgb(255 255 255 / 0.72)`, same blur, a hairline at the bottom.
- Without `backdrop-filter` support: `rgb(255 255 255 / 0.95)`.

### Radii and shadows

8 px for controls, 12 px for cards and panels, 4 px for the Google button (its own guideline), 50% for avatars.
Shadows mark elevation only: glass panels, menus, dialogs, the CV sheet.

## Buttons

Tactile rather than flat: a vertical gradient, a light top edge, and a 1 px press.

| Kind        | Default                                                 | Hover                          | Pressed                            |
| ----------- | ------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| Primary     | gradient `#5048e0` → `#4338ca`, border `#3730a3`, white | gradient → `#3730a3`           | `#2e2a8a`, inset shadow, 1 px down |
| Secondary   | gradient `#ffffff` → `#f4f6fa`, border `#cbd5e1`, ink   | gradient `#f8fafc` → `#eceff4` | `#e2e8f0`, inset shadow, 1 px down |
| Ghost       | transparent                                             | `rgb(15 23 42 / 0.07)`         | `rgb(15 23 42 / 0.13)`             |
| Destructive | gradient `#c4301f` → `#b42318`, white                   | darker gradient                | `#7f1910`                          |

- Text color is set explicitly for every state, so a global `a:hover` never paints dark text on a dark button.
- Minimum height 44 px for primary actions (40 px in dense toolbars); focus ring 2 px accent, offset 2 px.
- Disabled: `#e2e8f0` fill, `#64748b` text, no shadow.
- Arrows and icons on buttons only when they carry meaning.

### Sign-in buttons

Each follows its provider's own guideline.

- **GitHub:** `#24292f` fill, white text and mark, 8 px radius; on dark surfaces a light `#f6f8fa` version.
- **Google:** Google's branding spec: Roboto Medium 14/20, 40 px tall with a 44 px hit area, 4 px radius, white fill
  with a `#747775` border (dark: `#131314` fill, `#8e918f` border). Hover and press add 8% and 12% state layers.
  It costs one extra font request on the sign-in page. Until Google sign-in exists, the button is shown disabled
  with a visible "Coming soon".

## Layout

### Global header

Glass bar above every signed-in page: the mark and "Markup Résumé" (to the CV editor), the main navigation
(Applications, CVs, Master file, Templates), the account link on the right. The current page is marked with a 2 px
accent underline and `aria-current="page"`.

### Screens

| Route           | Screen       | Content                                                                                     |
| --------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `/`             | Landing      | what the product does, sign in with GitHub, the MCP tools, the PDF check, what is coming    |
| `/cvs`          | CV editor    | left: all CVs with quick switching; center: the sheet and the status bar; right: CV details |
| `/applications` | Applications | tracker table linked to the exact revision sent, cover letter, status                       |
| `/master-file`  | Master file  | optional free-text file with the whole experience, used when Claude writes a CV             |
| `/templates`    | Templates    | template cards with "Copy prompt" and an example                                            |
| `/account`      | Account      | name, sign-in method, numbers, Claude connections, sign out                                 |

The CV editor's right panel holds the vacancy fields (link, company, position, location, status) and "Mark as
applied with @N". Both sidebars are resizable (`role="separator"`).

The toolbar above the sheet is one row: the Visual / ATS segmented control, the CV's status chip, "Showing
`slug.html`" and Export PDF. The status bar under the sheet has the toolbar's height and shows validation, pages and
width, font, export time, the validation report, the app version and the zoom. It stays on one line: as it narrows,
the report, export time, font, validation and pages leave in that order; the zoom, in the same segmented track as
Visual / ATS, always stays at the right end. Menus over a sidebar row appear on hover or keyboard focus, on a glass
backing over the row's end.

### Responsive

Sidebars and content sit in a wrapping flex row, so panels stack on a phone; 16 px side gutter at phone width, no
horizontal page scroll; tap targets at least 44 px.

## Favicon and mark

An A4 sheet with a folded corner in the accent and an angle bracket cut into it: a document made of markup.

- `packages/web/public/mark.svg`: one file, light and dark (`prefers-color-scheme`); shapes on a 4-unit grid of a 64
  viewBox, so at 16 px every edge lands on a whole pixel and the bracket stroke is 2 px. The headers use it as the
  logo; it becomes `favicon.svg` when the favicon is replaced.
- Light: sheet `#1e293b`, fold `#a5b4fc`, bracket `#ffffff`. Dark: sheet `#f1f5f9`, fold `#4338ca`, bracket `#0f172a`.
- Still to do: `favicon.svg` and, exported with RealFaviconGenerator, `favicon.ico` (32 px, Safari and old browsers)
  and `apple-touch-icon.png` (180 px on a solid white background), plus their `<link>` tags. `index.html` still
  links the old `favicon.ico`.

## Motion

Only state feedback: 60–120 ms on press and hover. No entrance animations. `prefers-reduced-motion` turns
transitions off.

## Rules the code keeps

- Every UI string through Transloco; English copy, no em dashes.
- WCAG AA contrast at least; muted text never lighter than `#556274`.
- Unfinished UI is marked with `mrDummy`; pages not built yet say "In development" instead of showing fake content.
- Real elements: links navigate, buttons act, form fields have labels.
- SVG as separate files, never `data:` URIs.
