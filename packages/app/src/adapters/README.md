# Adapters

Implementations of domain ports and entry points. One sub-folder per adapter, e.g.
`chrome-cdp/`, `playwright/`, `poppler/`, `pdfjs/`, `storage-fs/`, `cli/`, `http/`, `mcp/`, `presence-http/`,
`html-parse5/`.

Rules (ADR-0010, enforced by ESLint):

- an adapter may import `domain` and `app`;
- adapters never import each other.
