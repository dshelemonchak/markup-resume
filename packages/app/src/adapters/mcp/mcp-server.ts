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
import { formatCvAddress } from '../../domain/index.ts';

const MIB = 1024 * 1024;

const cvAddress = z
  .string()
  .describe(
    'CV id as returned by list_cvs, for its current revision ("frontend-engineer"), or an address with a revision ' +
      'number for another one ("frontend-engineer@7"). Format examples only, not existing CVs.',
  );

const cvSummary = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().describe('ISO 8601'),
  revision: z.number().describe('Number of the current revision'),
  address: z.string().describe('Address of the current revision, e.g. "frontend-engineer@13"'),
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
    'Markup Résumé stores CVs as standalone HTML documents and shows them to the user in the Markup Résumé viewer.',
    `A CV is built on a template, named in <meta name="cv:template" content="…">; templates: ${refs.join(', ')}.`,
    'Before you create a CV with create_cv or change one with write_cv, call read_template for its template ' +
      'and follow those rules exactly: they list the only class names and structure the template accepts.',
    'Never write CSS: Markup Résumé puts the template styles into the document itself.',
    'Every change is kept as a numbered revision. Address a CV by its id for the current revision ("my-cv"), or ' +
      'by id@number for another one ("my-cv@7"). Write by id alone to build on the current revision. Write to ' +
      'id@number only when the user asks to start again from that revision: the result leaves out every newer ' +
      'revision, so tell the user so.',
  ].join('\n');

/**
 * The MCP server for Claude (ADR-0003): five tools over the CV use cases and templates. Transport-agnostic, so the
 * composition root connects it to stdio and tests connect it to an in-memory client.
 */
export function createMcpServer(services: CvDocumentServices, options: McpServerOptions = {}): McpServer {
  const { store, templates } = services;
  const server = new McpServer(
    { name: 'markup-resume', version: '0.0.0' },
    { instructions: instructions(templates.refs()) },
  );

  server.registerTool(
    'list_cvs',
    {
      title: 'List CVs',
      description:
        'Lists the CVs stored in Markup Résumé, most recently changed first. Each entry has the CV id ' +
        '(use it with read_cv and write_cv), its display title and the time of the last change. ' +
        'Call this first when the user refers to a CV by name rather than by id.',
      outputSchema: z.object({ cvs: z.array(cvSummary) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      options.onToolCall?.();
      const cvs = await listCvs(store);
      const output = { cvs: cvs.map((cv) => ({ ...cv, address: formatCvAddress(cv.id, cv.revision) })) };
      return { content: [text(JSON.stringify(output, null, 2))], structuredContent: output };
    },
  );

  server.registerTool(
    'read_cv',
    {
      title: 'Read CV',
      description:
        'Returns the full HTML document of one revision of a CV, the current one unless the id names another. ' +
        'The first part says which revision it is; the second part is the document, the single source of truth: ' +
        'content, structure and styles all live in this one file. Always read the CV right before editing it, ' +
        'and base the edit on exactly this document.',
      inputSchema: z.object({ id: cvAddress }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      options.onToolCall?.();
      const result = await getCvDocument(store, id);
      switch (result.kind) {
        case 'found':
          return { content: [text(revisionNote(result)), text(result.html)] };
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
        'Every write becomes a new numbered revision and the previous ones stay, so the user can go back; the user ' +
        'sees the change live in the Markup Résumé viewer. Written by id alone, it builds on the current revision ' +
        'and sending the same document again changes nothing. Written to id@number, it builds on that revision, ' +
        'as when the user asks to start again from it. A rejected document is not saved; the error lists what to fix.',
      inputSchema: z.object({
        id: cvAddress.describe(`${cvAddress.description} Only existing CVs can be written.`),
        html: z.string().describe('The complete new HTML document.'),
      }),
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ id, html }) => {
      options.onToolCall?.();
      const result = await saveCvDocument(services, id, html, 'claude');
      switch (result.kind) {
        case 'saved':
          return { content: [text(savedNote(result))] };
        case 'unchanged':
          return { content: [text(`CV "${id}" already has exactly this document; nothing was written.`)] };
        case 'invalid-id':
          return invalidId(id);
        case 'not-found':
          return notFound(id);
        case 'unknown-revision':
          return failure(`CV "${id}" has no such revision. Read it by its id to see the current revision.`);
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
        'Give it its own cv:title so the user can tell it apart in the Markup Résumé viewer.',
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
      const result = await createCvDocument(services, id, html, 'claude');
      switch (result.kind) {
        case 'created':
          return { content: [text(`Created CV "${id}". The user sees it in the Markup Résumé viewer.`)] };
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

/** Which revision read_cv returned, kept apart from the document so it never ends up in a later write. */
function revisionNote(result: { slug: string; number: number; current: number }): string {
  const address = formatCvAddress(result.slug, result.number);
  return result.number === result.current
    ? `This is ${address}, the current revision.`
    : `This is ${address}, an earlier revision; the current one is ${formatCvAddress(result.slug, result.current)}.`;
}

/** What write_cv tells Claude: the new address and, when an older base left revisions out, a warning to pass on. */
function savedNote(result: {
  slug: string;
  number: number;
  basedOn: number;
  basedOnCurrent: boolean;
}): string {
  const saved = `Saved as ${formatCvAddress(result.slug, result.number)}; earlier revisions are kept.`;
  if (result.basedOnCurrent) {
    return saved;
  }
  const first = result.basedOn + 1;
  const last = result.number - 1;
  const leftOut = first === last ? `@${first} is` : `@${first} to @${last} are`;
  return (
    `${saved} Warning: it is based on ${formatCvAddress(result.slug, result.basedOn)}, so ${leftOut} not in it. ` +
    'Tell the user, who decides what to do.'
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
