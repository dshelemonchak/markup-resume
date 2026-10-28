# Adapters

Implementations of domain ports and entry points, one sub-folder per adapter:

- `storage-fs/` — CVs and their history on disk;
- `http/` — the HTTP API and event stream for the UI;
- `mcp/` — the MCP server for Claude;
- `presence-http/` — tells the app that Claude is connected;
- `html-parse5/` — parses a CV the way a browser does, for the markup check;
- `chrome-cdp/` — prints a CV to PDF with Chromium;
- `poppler/` — reads fonts, text and links back out of a PDF.

The composition roots that wire them together are `../main.ts` (HTTP), `../mcp.ts` (MCP) and `../seed.ts`.

Rules (ADR-0010, enforced by ESLint):

- an adapter may import `domain` and `app`;
- adapters never import each other.
