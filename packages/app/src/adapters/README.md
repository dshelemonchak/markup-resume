# Adapters

Implementations of domain ports and entry points, one sub-folder per adapter:

- `storage-pg/` — CVs and their revisions in Postgres, migrations and the local owner;
- `http/` — the HTTP API and event stream for the UI;
- `mcp/` — the MCP server for Claude, served over HTTP at `/mcp`;
- `html-parse5/` — parses a CV the way a browser does, for the markup check;
- `chrome-cdp/` — prints a CV to PDF with Chromium;
- `poppler/` — reads fonts, text and links back out of a PDF.

The composition roots that wire them together are `../main.ts` (the app: HTTP API and MCP), `../seed.ts` and
`../import-files.ts`.

Rules (ADR-0010, enforced by ESLint):

- an adapter may import `domain` and `app`;
- adapters never import each other.
