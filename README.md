# cv-kit

A free, open-source workspace for writing your CV together with your own Claude: Claude edits the CV in a chat,
you see every change live, and the result exports to a PDF that reads correctly.

## Why

- **Your own Claude, no extra service.** cv-kit runs a local MCP server, so Claude Desktop and Claude Code work
  on your CVs directly through the Claude subscription you already have. There is no third-party plan or API key,
  and cv-kit adds no limits of its own: ask Claude to tailor a CV to a vacancy, rewrite a section or start a new
  version as often as your Claude plan allows. cv-kit runs on your machine and stores your CVs in a local folder.
- **A format Claude edits well.** Each CV is laid out in HTML and CSS: plain text that Claude reads and writes
  directly. A template owns the design and gives Claude its rules, so changing the wording never breaks the
  layout.
- **A PDF that reads correctly.** The browser lays out real text, so the PDF keeps words, their order and their
  links. PDFs exported from design tools often look right but extract badly: letters split apart (`C anvas`),
  words merged, two-column layouts read across, or no text at all where a font is turned into outlines. Applicant
  tracking systems read that text. cv-kit checks every export against the rendered page and holds back a PDF
  that does not read like the page.

## Features

- **One document per CV.** Content and the template reference live in one standalone HTML file. There is no
  database and no separate content model.
- **Templates with a design system.** Each template defines its styles, a machine-readable schema of allowed
  classes and nesting, rules for Claude, and an example document. The bundled `classic` template reproduces its
  reference design to within 0.3 mm.
- **MCP tools for Claude:** `list_cvs`, `read_cv`, `read_template`, `create_cv`, `write_cv`.
- **Markup validation on every write.** Documents that break the template schema are rejected with a list of
  problems for Claude to fix. Rejected content includes unknown classes, misplaced blocks, inline styles, scripts
  and external resources. cv-kit inserts the template CSS itself.
- **Live viewer.** The Angular UI renders each CV at its real size and updates as soon as Claude saves a change.
  It also shows whether Claude is connected.
- **Validated PDF export.** The CV is printed with headless Chromium and read back with poppler. The check covers:
  - fonts: embedded, with a Unicode mapping, no Type 3;
  - words: none split, merged, lost or added;
  - blocks: each extracted in one piece and in reading order;
  - links: clickable.

## Status

Early development. The core workflow works end to end on one template. Planned next:

- ATS-oriented output;
- page-count and overflow checks;
- revision history and rollback in the UI;
- additional templates.

UI elements that are not implemented yet are marked with a red "dummy" overlay.

## Getting started

Requirements: Docker (Docker Desktop on macOS). All tooling runs in containers.

```bash
docker compose up -d dev
docker compose exec dev pnpm install
docker compose exec dev pnpm seed        # adds a fictional example CV to ./data
docker compose up -d app web
```

Open http://localhost:4200.

CVs are stored in `./data`, which is excluded from git.

### Connecting Claude

The **Connect Claude** dialog in the sidebar covers both clients:

- **Claude Code** — the server is configured in `.mcp.json` and is picked up automatically in this folder.
- **Claude Desktop** — download `cv-kit.mcpb` from the dialog and install it under Settings → Extensions.
  The extension starts the MCP server through Docker, so Docker Desktop must be running.

Example prompt: _"Read the classic template and create a CV for this vacancy: …"_

## Architecture

```
packages/
  app/      Node.js: domain, use cases, adapters (HTTP API, MCP server, PDF export)
  web/      Angular UI (standalone, zoneless, signals)
  styles/   templates, fonts and icons
```

The server follows a ports-and-adapters layout:

- `domain` — types and pure rules, including the markup and PDF checks;
- `app` — use cases;
- adapters — file storage, HTTP, MCP, Chromium over the DevTools Protocol, poppler, parse5.

Import boundaries between the layers are enforced by ESLint. The HTTP API and the MCP server are two entry points
to the same use cases.

## Development

```bash
docker compose exec dev pnpm check       # lint, format check, typecheck, tests
```

The test suite includes an integration test that renders a page with the container's Chromium.

## Development approach

cv-kit is developed AI-first with Claude Code. Architecture, trade-offs and implementation decisions are made by
the author. Every change is reviewed before it is committed, and Claude Code writes most of the code under that
direction.

## License

MIT — see [LICENSE](LICENSE).

Bundled assets:

- Inter font — SIL Open Font License 1.1 (`packages/styles/fonts/inter/`);
- contact icons — based on Bootstrap Icons, MIT.
