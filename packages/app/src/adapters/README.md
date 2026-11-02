# Adapters

Implementations of domain ports and entry points, one sub-folder per adapter:

- `postgres-storage/` — resumes and their revisions, users and sign-in sessions in Postgres, and migrations;
- `github-identity-provider/` — signing in with a GitHub OAuth App;
- `http-api/` — the HTTP API and event stream for the UI;
- `mcp-server/` — the MCP server for Claude, served over HTTP at `/mcp`;
- `parse5-html-parser/` — parses a resume the way a browser does, for the markup check;
- `chrome-pdf-renderer/` — prints a resume to PDF with Chromium;
- `poppler-pdf-inspector/` — reads fonts, text and links back out of a PDF.

The composition roots that wire them together are `../main.ts` (the app: HTTP API and MCP), `../seed.ts`,
`../import-files.ts` and `../claim-local-resumes.ts`.

Rules (ADR-0010, enforced by ESLint):

- an adapter may import `domain` and `app`;
- adapters never import each other.
