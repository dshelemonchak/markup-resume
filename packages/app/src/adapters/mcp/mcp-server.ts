import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createCvDocument,
  type CvDocumentServices,
  getCvDocument,
  listCvs,
  MAX_CV_DOCUMENT_BYTES,
  saveCvDocument,
} from '../../app/index.ts';

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
 * Sent to the client in the handshake; Claude reads it before it uses any tool. The template list is filled
 * in from the catalog.
 */
const instructions = (refs: readonly string[]) =>
  [
    'cv-kit stores CVs as standalone HTML documents and shows them to the user in the cv-kit viewer.',
    `A CV is built on a template, named in <meta name="cv:template" content="…">; templates: ${refs.join(', ')}.`,
    'Before you create a CV with create_cv or change one with write_cv, call read_template for its template ' +
      'and follow those rules exactly: they list the only class names and structure the template accepts.',
    'Never write CSS: cv-kit puts the template styles into the document itself.',
  ].join('\n');

/**
 * The MCP server for Claude (ADR-0003): five tools over the CV use cases and templates. Transport-agnostic, so the
 * composition root connects it to stdio and tests connect it to an in-memory client.
 */
export function createMcpServer(services: CvDocumentServices, options: McpServerOptions = {}): McpServer {
  const { repository, templates } = services;
  const server = new McpServer(
    { name: 'cv-kit', version: '0.0.0' },
    { instructions: instructions(templates.refs()) },
  );

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
        'Replaces the whole HTML document of an existing CV; for a new CV use create_cv. There is no ' +
        'partial update: ' +
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
      const result = await saveCvDocument(services, id, html);
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
        case 'invalid-document':
          return rejected(result);
      }
    },
  );

  server.registerTool(
    'create_cv',
    {
      title: 'Create CV',
      description:
        'Creates a new CV from a complete HTML document, under a new id. Use it when the user asks for ' +
        'a new CV, for example one tailored to a vacancy; to change an existing CV use write_cv instead. ' +
        'Never replaces an existing CV: if the id is taken, nothing is written and you can pick another. ' +
        'Build the document by the rules from read_template; the same checks as in write_cv apply. ' +
        'Give it its own cv:title so the user can tell it apart in the cv-kit viewer.',
      inputSchema: z.object({
        id: z
          .string()
          .describe(
            'A new id: lower-case words joined by single hyphens, describing the CV, e.g. ' +
              '"frontend-acme". Must not be in list_cvs.',
          ),
        html: z.string().describe('The complete HTML document of the new CV.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ id, html }) => {
      options.onToolCall?.();
      const result = await createCvDocument(services, id, html);
      switch (result.kind) {
        case 'created':
          return { content: [text(`Created CV "${id}". The user sees it in the cv-kit viewer.`)] };
        case 'already-exists':
          return failure(
            `A CV with the id "${id}" already exists; nothing was written. Choose an id that is not in ` +
              'list_cvs, or use write_cv if you meant to change that CV.',
          );
        case 'invalid-id':
          return failure(`"${id}" is not a valid CV id: use lower-case words joined by single hyphens.`);
        case 'too-large':
        case 'invalid-document':
          return rejected(result);
      }
    },
  );

  server.registerTool(
    'read_template',
    {
      title: 'Read template',
      description:
        "Returns a CV template's design system: the document structure, the only class names it accepts, " +
        'the rules for the text, and a complete example document. Call it before create_cv or write_cv, ' +
        'for the template the CV names in cv:template (or the one you will use for a new CV).',
      inputSchema: z.object({
        template: z.string().describe(`Template reference, one of: ${templates.refs().join(', ')}.`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ template }) => {
      options.onToolCall?.();
      const guide = templates.guide(template);
      if (!guide) {
        return failure(`There is no template "${template}". Templates: ${templates.refs().join(', ')}.`);
      }
      const example = ['## Example document', '', '```html', guide.example.trimEnd(), '```'].join('\n');
      return { content: [text(`${guide.rules.trimEnd()}\n\n${example}\n`)] };
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

/** A document that failed the checks shared by write_cv and create_cv. */
function rejected(
  result:
    | { readonly kind: 'too-large'; readonly bytes: number; readonly limitBytes: number }
    | { readonly kind: 'invalid-document'; readonly problems: readonly string[] },
): CallToolResult {
  if (result.kind === 'too-large') {
    return failure(
      `The document is ${(result.bytes / MIB).toFixed(2)} MiB; the limit is ` +
        `${result.limitBytes / MIB} MiB. Nothing was saved.`,
    );
  }
  return failure(
    ['The document was not saved:', ...result.problems.map((problem) => `- ${problem}`)].join('\n'),
  );
}

function invalidId(id: string): CallToolResult {
  return failure(
    `"${id}" is not a valid CV id: lower-case words joined by single hyphens. Use an id from list_cvs.`,
  );
}

function notFound(id: string): CallToolResult {
  return failure(`There is no CV with the id "${id}". Use an id from list_cvs.`);
}
