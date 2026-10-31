import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createResumeDocument,
  type ResumeDocumentDependencies,
  readResumeDocument,
  listResumes,
  MAX_RESUME_DOCUMENT_BYTES,
  saveResumeDocument,
} from '../../app/index.ts';
import { formatResumeAddress } from '../../domain/index.ts';

const MIB = 1024 * 1024;

const resumeAddress = z
  .string()
  .describe(
    'The resume\'s slug from list_resumes, for its current revision ("frontend-engineer"), or slug@number for ' +
      'another revision ("frontend-engineer@7"). Format examples only, not existing CVs.',
  );

const resumeListItem = z.object({
  slug: z.string(),
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
    `A CV is built on a template, named in <meta name="resume:template" content="…">; templates: ${refs.join(', ')}.`,
    'Before you create a CV with create_resume or change one with write_resume, call read_template for its template ' +
      'and follow those rules exactly: they list the only class names and structure the template accepts.',
    'Never write CSS: Markup Résumé puts the template styles into the document itself.',
    'Every change is kept as a numbered revision. Address a CV by its slug for the current revision ("my-resume"), or ' +
      'by slug@number for another one ("my-resume@7"). Write by slug alone to build on the current revision. Write to ' +
      'slug@number only when the user asks to start again from that revision: the result leaves out every newer ' +
      'revision, so tell the user so.',
  ].join('\n');

/**
 * The MCP server for Claude (ADR-0003): five tools over the CV use cases and templates. Transport-agnostic, so the
 * composition root connects it to stdio and tests connect it to an in-memory client.
 */
export function createMcpServer(
  dependencies: ResumeDocumentDependencies,
  options: McpServerOptions = {},
): McpServer {
  const { repository, templates } = dependencies;
  const server = new McpServer(
    { name: 'markup-resume', version: '0.0.0' },
    { instructions: instructions(templates.refs()) },
  );

  server.registerTool(
    'list_resumes',
    {
      title: 'List CVs',
      description:
        'Lists the CVs stored in Markup Résumé, most recently changed first. Each entry has the CV slug ' +
        '(use it with read_resume and write_resume), its display title and the time of the last change. ' +
        'Call this first when the user refers to a CV by name rather than by slug.',
      outputSchema: z.object({ resumes: z.array(resumeListItem) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      options.onToolCall?.();
      const resumes = await listResumes(repository);
      const output = {
        resumes: resumes.map((resume) => ({
          ...resume,
          address: formatResumeAddress(resume.slug, resume.revision),
        })),
      };
      return { content: [text(JSON.stringify(output, null, 2))], structuredContent: output };
    },
  );

  server.registerTool(
    'read_resume',
    {
      title: 'Read CV',
      description:
        'Returns the full HTML document of one revision of a CV, the current one unless the address names another. ' +
        'The first part says which revision it is; the second part is the document, the single source of truth: ' +
        'content, structure and styles all live in this one file. Always read the CV right before editing it, ' +
        'and base the edit on exactly this document.',
      inputSchema: z.object({ resume: resumeAddress }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ resume: address }) => {
      options.onToolCall?.();
      const result = await readResumeDocument(repository, address);
      switch (result.kind) {
        case 'found':
          return { content: [text(revisionNote(result)), text(result.html)] };
        case 'invalid-slug':
          return invalidSlug(address);
        case 'not-found':
          return notFound(address);
      }
    },
  );

  server.registerTool(
    'write_resume',
    {
      title: 'Write CV',
      description:
        'Replaces the whole HTML document of an existing CV; for a new CV use create_resume. There is no ' +
        'partial update: ' +
        'send the complete document, with every part you did not mean to change kept exactly as ' +
        'read_resume returned it. The document must start with <!doctype html>, end with </html> and keep ' +
        `<meta name="resume:title" content="…">; the size limit is ${MAX_RESUME_DOCUMENT_BYTES / MIB} MiB. ` +
        'Every write becomes a new numbered revision and the previous ones stay, so the user can go back; the user ' +
        'sees the change live in the Markup Résumé viewer. Written by slug alone, it builds on the current revision ' +
        'and sending the same document again changes nothing. Written to slug@number, it builds on that revision, ' +
        'as when the user asks to start again from it. A rejected document is not saved; the error lists what to fix.',
      inputSchema: z.object({
        resume: resumeAddress.describe(`${resumeAddress.description} Only existing CVs can be written.`),
        html: z.string().describe('The complete new HTML document.'),
      }),
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ resume: address, html }) => {
      options.onToolCall?.();
      const result = await saveResumeDocument(dependencies, address, html, 'claude');
      switch (result.kind) {
        case 'saved':
          return { content: [text(savedNote(result))] };
        case 'unchanged':
          return {
            content: [text(`CV "${address}" already has exactly this document; nothing was written.`)],
          };
        case 'invalid-slug':
          return invalidSlug(address);
        case 'not-found':
          return notFound(address);
        case 'unknown-revision':
          return failure(
            `CV "${address}" has no such revision. Read it by its slug to see the current revision.`,
          );
        case 'too-large':
        case 'invalid-document':
          return rejected(result);
      }
    },
  );

  server.registerTool(
    'create_resume',
    {
      title: 'Create CV',
      description:
        'Creates a new CV from a complete HTML document, under a new slug. Use it when the user asks for ' +
        'a new CV, for example one tailored to a vacancy; to change an existing CV use write_resume instead. ' +
        'Never replaces an existing CV: if the slug is taken, nothing is written and you can pick another. ' +
        'Build the document by the rules from read_template; the same checks as in write_resume apply. ' +
        'Give it its own resume:title so the user can tell it apart in the Markup Résumé viewer.',
      inputSchema: z.object({
        resume: z
          .string()
          .describe(
            'A new slug: lower-case words joined by single hyphens, describing the CV, e.g. ' +
              '"frontend-acme". Must not be in list_resumes.',
          ),
        html: z.string().describe('The complete HTML document of the new CV.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ resume: slug, html }) => {
      options.onToolCall?.();
      const result = await createResumeDocument(dependencies, slug, html, 'claude');
      switch (result.kind) {
        case 'created':
          return { content: [text(`Created CV "${slug}". The user sees it in the Markup Résumé viewer.`)] };
        case 'already-exists':
          return failure(
            `A CV "${slug}" already exists; nothing was written. Choose a slug that is not in ` +
              'list_resumes, or use write_resume if you meant to change that CV.',
          );
        case 'invalid-slug':
          return failure(`"${slug}" is not a valid slug: use lower-case words joined by single hyphens.`);
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
        'the rules for the text, and a complete example document. Call it before create_resume or write_resume, ' +
        'for the template the CV names in resume:template (or the one you will use for a new CV).',
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

/** A document that failed the checks shared by write_resume and create_resume. */
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

/** Which revision read_resume returned, kept apart from the document so it never ends up in a later write. */
function revisionNote(result: { slug: string; number: number; current: number }): string {
  const address = formatResumeAddress(result.slug, result.number);
  return result.number === result.current
    ? `This is ${address}, the current revision.`
    : `This is ${address}, an earlier revision; the current one is ${formatResumeAddress(result.slug, result.current)}.`;
}

/** What write_resume tells Claude: the new address and, when an older base left revisions out, a warning to pass on. */
function savedNote(result: {
  slug: string;
  number: number;
  basedOn: number;
  basedOnCurrent: boolean;
}): string {
  const saved = `Saved as ${formatResumeAddress(result.slug, result.number)}; earlier revisions are kept.`;
  if (result.basedOnCurrent) {
    return saved;
  }
  const first = result.basedOn + 1;
  const last = result.number - 1;
  const leftOut = first === last ? `@${first} is` : `@${first} to @${last} are`;
  return (
    `${saved} Warning: it is based on ${formatResumeAddress(result.slug, result.basedOn)}, so ${leftOut} not in it. ` +
    'Tell the user, who decides what to do.'
  );
}

function invalidSlug(address: string): CallToolResult {
  return failure(
    `"${address}" is not a valid slug or address: lower-case words joined by single hyphens, optionally @number. Use a slug from list_resumes.`,
  );
}

function notFound(address: string): CallToolResult {
  return failure(`There is no CV "${address}". Use a slug from list_resumes.`);
}
