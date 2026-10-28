import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getCvDocument, listCvs, MAX_CV_DOCUMENT_BYTES, saveCvDocument } from '../../app/index.ts';
import type { CvRepository } from '../../domain/index.ts';

const MIB = 1024 * 1024;

const cvId = z
  .string()
  .describe('CV id as returned by list_cvs. Format example only, not an existing CV: "frontend-engineer".');

const cvSummary = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().describe('ISO 8601'),
});

export interface McpServerOptions {
  /** Called on every tool call, e.g. to report Claude's activity to the UI (ADR-0018). */
  readonly onToolCall?: () => void;
}

/**
 * The MCP server for Claude (ADR-0003): three tools over the CV use cases. Transport-agnostic, so the
 * composition root connects it to stdio and tests connect it to an in-memory client.
 */
export function createMcpServer(repository: CvRepository, options: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'cv-kit', version: '0.0.0' });

  server.registerTool(
    'list_cvs',
    {
      title: 'List CVs',
      description:
        'Lists the CVs stored in cv-kit, most recently changed first. Each entry has the CV id ' +
        '(use it with read_cv and write_cv), its display title and the time of the last change. ' +
        'Call this first when the user refers to a CV by name rather than by id.',
      outputSchema: z.object({ cvs: z.array(cvSummary) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      options.onToolCall?.();
      const cvs = await listCvs(repository);
      const output = { cvs: [...cvs] };
      return { content: [text(JSON.stringify(output, null, 2))], structuredContent: output };
    },
  );

  server.registerTool(
    'read_cv',
    {
      title: 'Read CV',
      description:
        'Returns the full HTML document of one CV. The document is the single source of truth: ' +
        'content, structure and styles all live in this one file. Always read the CV right before ' +
        'editing it, and base the edit on exactly this text.',
      inputSchema: z.object({ id: cvId }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      options.onToolCall?.();
      const result = await getCvDocument(repository, id);
      switch (result.kind) {
        case 'found':
          return { content: [text(result.html)] };
        case 'invalid-id':
          return invalidId(id);
        case 'not-found':
          return notFound(id);
      }
    },
  );

  server.registerTool(
    'write_cv',
    {
      title: 'Write CV',
      description:
        'Replaces the whole HTML document of an existing CV. There is no partial update: ' +
        'send the complete document, with every part you did not mean to change kept exactly as ' +
        'read_cv returned it. The document must start with <!doctype html>, end with </html> and keep ' +
        `<meta name="cv:title" content="…">; the size limit is ${MAX_CV_DOCUMENT_BYTES / MIB} MiB. ` +
        "The previous version is kept in the CV's history, and the user sees the change live in the " +
        'cv-kit viewer. Sending the same document again changes nothing. A rejected document is not ' +
        'saved; the error lists what to fix.',
      inputSchema: z.object({
        id: cvId.describe(`${cvId.description} Only existing CVs can be written.`),
        html: z.string().describe('The complete new HTML document.'),
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, html }) => {
      options.onToolCall?.();
      const result = await saveCvDocument(repository, id, html);
      switch (result.kind) {
        case 'saved':
          return { content: [text(`Saved CV "${id}". The previous version is in its history.`)] };
        case 'unchanged':
          return { content: [text(`CV "${id}" already has exactly this document; nothing was written.`)] };
        case 'invalid-id':
          return invalidId(id);
        case 'not-found':
          return notFound(id);
        case 'too-large':
          return failure(
            `The document is ${(result.bytes / MIB).toFixed(2)} MiB; the limit is ` +
              `${result.limitBytes / MIB} MiB. Nothing was saved.`,
          );
        case 'invalid-document':
          return failure(
            ['The document was not saved:', ...result.problems.map((problem) => `- ${problem}`)].join('\n'),
          );
      }
    },
  );

  return server;
}

function text(value: string) {
  return { type: 'text' as const, text: value };
}

/** A tool-level error: the model sees it and can correct the call (unlike a JSON-RPC error). */
function failure(message: string): CallToolResult {
  return { content: [text(message)], isError: true };
}

function invalidId(id: string): CallToolResult {
  return failure(
    `"${id}" is not a valid CV id: lower-case words joined by single hyphens. Use an id from list_cvs.`,
  );
}

function notFound(id: string): CallToolResult {
  return failure(`There is no CV with the id "${id}". Use an id from list_cvs.`);
}
