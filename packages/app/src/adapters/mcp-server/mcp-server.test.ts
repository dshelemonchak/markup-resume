import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanonicalResumeHtml, TemplateCatalog } from '../../domain/index.ts';
import { createMcpServer } from './mcp-server.ts';
import { ResumeChanges } from '../../app/index.ts';
import { InMemoryResumeRepository } from '../../app/testing/in-memory-resume-repository.ts';

const doc = (title: string) =>
  `<!doctype html><html><head><meta name="resume:title" content="${title}"><meta name="resume:template" content="classic@0.0.3"></head><body></body></html>`;
/** The same document as stored, with the template styles put in. */
const stored = (title: string) =>
  doc(title).replace(
    '</head>',
    '  <style id="resume-lib" data-resume-lib="classic@0.0.3">\np {}\n  </style>\n</head>',
  );

const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.3'],
  styles: (ref) => (ref === 'classic@0.0.3' ? 'p {}' : null),
  guide: (ref) => (ref === 'classic@0.0.3' ? { rules: '# Rules\n', example: '<!doctype html>\n' } : null),
  schema: () => null,
};

let repository: InMemoryResumeRepository;
let client: Client;
let toolCalls: number;

/** The current document of a CV, or undefined. */
const current = async (slug: string) => (await repository.read(slug))?.html;

/** A real MCP client talking to the server over linked in-memory transports: the whole protocol, no stdio. */
beforeEach(async () => {
  repository = new InMemoryResumeRepository();
  // Put in as stored, past the boundary, so the tests see exactly what they put in.
  await repository.create({
    slug: 'sample',
    title: 'Sample',
    html: doc('Sample') as CanonicalResumeHtml,
    template: { name: 'classic', version: '0.0.3' },
    author: 'system',
  });
  toolCalls = 0;
  const resumeChanges = new ResumeChanges();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([
    createMcpServer(
      {
        repository,
        resumeChanges,
        templates,
        parseHtml: (html) => ({ tree: { tag: 'html', attributes: new Map(), children: [] }, html }),
      },
      { onToolCall: () => toolCalls++ },
    ).connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterEach(async () => {
  await client.close();
});

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text?: string }[];
  return first?.text ?? '';
}

/** Every text part of a result, e.g. read_resume's revision note and its document. */
function textsOf(result: Awaited<ReturnType<Client['callTool']>>): string[] {
  return (result.content as { type: string; text?: string }[]).map((part) => part.text ?? '');
}

describe('MCP server', () => {
  it('advertises the five tools with input schemas and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'create_resume',
      'list_resumes',
      'read_resume',
      'read_template',
      'write_resume',
    ]);
    const writeResume = tools.find((tool) => tool.name === 'write_resume')!;
    expect(writeResume.inputSchema.required).toEqual(['resume', 'html']);
    expect(writeResume.annotations).toMatchObject({ destructiveHint: true, idempotentHint: false });
  });

  it('lists CVs as text and structured content', async () => {
    const result = await client.callTool({ name: 'list_resumes', arguments: {} });
    expect(result.structuredContent).toEqual({
      resumes: [
        {
          slug: 'sample',
          title: 'Sample',
          updatedAt: '2026-10-31T10:00:01.000Z',
          revision: 1,
          address: 'sample@1',
        },
      ],
    });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });

  it('reads a CV, and reports a missing one as a tool error', async () => {
    expect(textsOf(await client.callTool({ name: 'read_resume', arguments: { resume: 'sample' } }))).toEqual([
      'This is sample@1, the current revision.',
      doc('Sample'),
    ]);

    const missing = await client.callTool({ name: 'read_resume', arguments: { resume: 'missing' } });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain('There is no CV "missing"');
  });

  it('writes a CV, then reports the same document as unchanged', async () => {
    const saved = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample', html: doc('New') },
    });
    expect(saved.isError).toBeFalsy();
    expect(await current('sample')).toBe(stored('New'));

    const again = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample', html: doc('New') },
    });
    expect(textOf(again)).toContain('nothing was written');
  });

  it('reads an earlier revision and says which one is current', async () => {
    await client.callTool({ name: 'write_resume', arguments: { resume: 'sample', html: doc('New') } });
    expect(
      textsOf(await client.callTool({ name: 'read_resume', arguments: { resume: 'sample@1' } })),
    ).toEqual(['This is sample@1, an earlier revision; the current one is sample@2.', doc('Sample')]);
  });

  it('says where a write went, and warns when an older base left revisions out', async () => {
    const saved = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample', html: doc('Two') },
    });
    expect(textOf(saved)).toBe('Saved as sample@2; earlier revisions are kept.');
    await client.callTool({ name: 'write_resume', arguments: { resume: 'sample', html: doc('Three') } });

    const fromFirst = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample@1', html: doc('Again') },
    });
    expect(textOf(fromFirst)).toBe(
      'Saved as sample@4; earlier revisions are kept. Warning: it is based on sample@1, so @2 to @3 are not in it. ' +
        'Tell the user, who decides what to do.',
    );

    const unknown = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample@9', html: doc('X') },
    });
    expect(unknown.isError).toBe(true);
  });

  it('tells Claude in the handshake how revisions are addressed', () => {
    expect(client.getInstructions()).toContain('slug@number');
  });

  it('rejects a broken document with the list of problems', async () => {
    const result = await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample', html: '<p>cut' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('- The document must end with </html>');
    expect(await current('sample')).toBe(doc('Sample'));
  });

  it('creates a CV under a new slug, and never replaces an existing one', async () => {
    const created = await client.callTool({
      name: 'create_resume',
      arguments: { resume: 'fresh', html: doc('Fresh') },
    });
    expect(created.isError).toBeFalsy();
    expect(await current('fresh')).toBe(stored('Fresh'));

    const taken = await client.callTool({
      name: 'create_resume',
      arguments: { resume: 'sample', html: doc('Other') },
    });
    expect(taken.isError).toBe(true);
    expect(textOf(taken)).toContain('already exists');
    expect(await current('sample')).toBe(doc('Sample'));
  });

  it('rejects a broken new document without creating it', async () => {
    const result = await client.callTool({
      name: 'create_resume',
      arguments: { resume: 'fresh', html: '<p>cut' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('- The document must end with </html>');
    expect(await current('fresh')).toBeUndefined();
  });

  it('tells Claude in the handshake to read the template before writing', () => {
    const instructions = client.getInstructions();
    expect(instructions).toContain('call read_template');
    expect(instructions).toContain('classic@0.0.3');
  });

  it("returns a template's rules with its example, and names the templates for an unknown one", async () => {
    const result = await client.callTool({ name: 'read_template', arguments: { template: 'classic@0.0.3' } });
    expect(textOf(result)).toBe('# Rules\n\n## Example document\n\n```html\n<!doctype html>\n```\n');

    const unknown = await client.callTool({ name: 'read_template', arguments: { template: 'modern@1.0.0' } });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('Templates: classic@0.0.3');
  });

  it('rejects arguments that do not match the input schema', async () => {
    const result = await client.callTool({ name: 'write_resume', arguments: { resume: 'sample' } });
    expect(result.isError).toBe(true);
  });

  it('reports every tool call', async () => {
    await client.callTool({ name: 'list_resumes', arguments: {} });
    await client.callTool({ name: 'read_resume', arguments: { resume: 'sample' } });
    await client.callTool({
      name: 'write_resume',
      arguments: { resume: 'sample', html: (await current('sample'))! },
    });
    expect(toolCalls).toBe(3);
  });
});
