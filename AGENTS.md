# AGENTS.md

Markup Résumé: CVs are standalone HTML documents built on templates; Claude edits them over MCP, an Angular UI
shows them live, and PDF export is checked against the rendered page. See `README.md` for the product overview.

## Repository map

- `packages/app` — Node 24 (TypeScript run directly, no build step), Hono, Kysely/Postgres. Ports and adapters:
  - `src/domain` — types, ports and pure rules; no I/O, no third-party runtime imports.
  - `src/app` — use cases; imports `domain` only.
  - `src/adapters/<technology>-<role>` (e.g. `chrome-pdf-renderer`) — import `domain` and `app`, never each other.
  - Composition roots: `src/main.ts` (HTTP API and MCP at `/mcp`), `src/seed.ts`, `src/import-files.ts`,
    `src/claim-local-resumes.ts`. Seed and the importers act for the user in `OWNER_GITHUB_ID` (`src/owner.ts`).
    MCP (ADR-0028): hosted on https, for the user of its OAuth token (`/oauth/*`); in a local run (http on
    localhost), only for this machine and for `OWNER_GITHUB_ID`.
  - Layer boundaries are enforced by ESLint (`eslint-plugin-boundaries`).
- `packages/web` — Angular 22: standalone, zoneless, signals; Transloco i18n.
- `packages/styles` — templates (`templates/<name>/`), Inter fonts, contact icons.

## Commands

All tooling runs in Docker; run commands in the `dev` container from the repository root:

- `docker compose exec dev pnpm check` — lint, format check, typecheck, i18n keys, unit tests (the CI gate).
- `docker compose exec dev pnpm test:db` — Postgres tests (`*.db.test.ts`); needs the `db` service.
- `docker compose exec dev pnpm format` — Prettier.
- `docker compose exec dev pnpm --filter @markup-resume/app db:types` — regenerate
  `database-types.generated.ts` after a schema change (needs `db`).

`db`, `app` and `web` are started by the developer (Compose or the IDE configs in `.run/`). Don't start or stop
them; ask if a check needs one.

## Conventions

- **Naming:** `resume` in all code and data identifiers (types, files, tables, routes, MCP tools); "CV" only in
  user-facing text. A resume is addressed by `slug` (never `id`); revisions as `slug@number`. Dependency bundles end
  in `…Dependencies`; storage is a `…Repository`; ports are named by role (`HtmlParser`, `PdfRenderer`).
- **Style:** always brace `if`/`else` bodies on their own lines (older code still has one-line ifs). Prettier:
  single quotes, width 110.
- **Web:** one component per folder; helpers and nested components sit next to the folder, not inside it.
  Selector prefix `mr`. Mark unfinished UI with the `mrDummy` directive. Every UI string goes through Transloco
  (`public/i18n/en.json`); `pnpm i18n` fails on missing or unused keys.
- **Templates:** a template is `template.css`, `schema.json` (allowed classes and nesting), `rules.md` (the same
  rules for Claude) and `example.html`; a test keeps them consistent. CV documents use the `resume-` class and
  `resume:*` meta namespace. Any change to a template's files bumps its version (`TEMPLATES` in
  `packages/styles/src/index.ts`, the heading of `rules.md`, the meta in `example.html`).
- **SVG:** separate `.svg` files only, never `data:` URIs.
- **Database:** schema changes are new Kysely migrations in `adapters/postgres-storage/migrations/`
  (`YYYY-MM-DD-description.ts`), applied at app startup; never edit an applied one.
- **Validation:** every CV write goes through `validateResumeDocument` (domain); storage accepts only its
  `CanonicalResumeHtml` output.

## Safety

- Never commit personal data: `/data/`, `/reference/` and `/docs/` are git-ignored on purpose.
- `main` is protected: work on `feat/…`, `fix/…` or `chore/…` branches, open a PR, rebase-merge after CI passes.
  Conventional commit messages (`feat(app): …`).
