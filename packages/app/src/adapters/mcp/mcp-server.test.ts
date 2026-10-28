import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CvRepository, TemplateCatalog } from '../../domain/index.ts';
import { createMcpServer } from './mcp-server.ts';

const doc = (title: string) => `<!doctype html><html><meta name="cv:title" content="${title}"></html>`;

const templates: TemplateCatalog = {
  refs: () => ['classic@0.0.2'],
  styles: (ref) => (ref === 'classic@0.0.2' ? 'p {}' : null),
  guide: (ref) => (ref === 'classic@0.0.2' ? { rules: '# Rules\n', example: '<!doctype html>\n' } : null),
  schema: () => null,
};

let documents: Record<string, string>;
let client: Client;
let toolCalls: number;

/** A real MCP client talking to the server over linked in-memory transports: the whole protocol, no stdio. */
beforeEach(async () => {
  documents = { sample: doc('Sample') };
  toolCalls = 0;
  const repository: CvRepository = {
    list: () =>
      Promise.resolve(
        Object.keys(documents).map((id) => ({ id, title: id, updatedAt: '2026-10-28T00:00:00.000Z' })),
      ),
    getDocument: (id) => Promise.resolve(documents[id] ?? null),
    save: (id, html) => {
      documents[id] = html;
      return Promise.resolve();
    },
    create: (id, html) => {
      if (id in documents) return Promise.resolve(false);
      documents[id] = html;
      return Promise.resolve(true);
    },
    watch: () => () => {},
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([
    createMcpServer(
      { repository, templates, parseMarkup: () => ({ tag: 'html', attributes: new Map(), children: [] }) },
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

describe('MCP server', () => {
  it('advertises the five tools with input schemas and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'create_cv',
      'list_cvs',
      'read_cv',
      'read_template',
      'write_cv',
    ]);
    const writeCv = tools.find((tool) => tool.name === 'write_cv')!;
    expect(writeCv.inputSchema.required).toEqual(['id', 'html']);
    expect(writeCv.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true });
  });

  it('lists CVs as text and structured content', async () => {
    const result = await client.callTool({ name: 'list_cvs', arguments: {} });
    expect(result.structuredContent).toEqual({
      cvs: [{ id: 'sample', title: 'sample', updatedAt: '2026-10-28T00:00:00.000Z' }],
    });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });

  it('reads a CV, and reports a missing one as a tool error', async () => {
    expect(textOf(await client.callTool({ name: 'read_cv', arguments: { id: 'sample' } }))).toBe(
      doc('Sample'),
    );

    const missing = await client.callTool({ name: 'read_cv', arguments: { id: 'missing' } });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain('There is no CV with the id "missing"');
  });

  it('writes a CV, then reports the same document as unchanged', async () => {
    const saved = await client.callTool({ name: 'write_cv', arguments: { id: 'sample', html: doc('New') } });
    expect(saved.isError).toBeFalsy();
    expect(documents['sample']).toBe(doc('New'));

    const again = await client.callTool({ name: 'write_cv', arguments: { id: 'sample', html: doc('New') } });
    expect(textOf(again)).toContain('nothing was written');
  });

  it('rejects a broken document with the list of problems', async () => {
    const result = await client.callTool({ name: 'write_cv', arguments: { id: 'sample', html: '<p>cut' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('- The document must end with </html>');
    expect(documents['sample']).toBe(doc('Sample'));
  });

  it('creates a CV under a new id, and never replaces an existing one', async () => {
    const created = await client.callTool({
      name: 'create_cv',
      arguments: { id: 'fresh', html: doc('Fresh') },
    });
    expect(created.isError).toBeFalsy();
    expect(documents['fresh']).toBe(doc('Fresh'));

    const taken = await client.callTool({
      name: 'create_cv',
      arguments: { id: 'sample', html: doc('Other') },
    });
    expect(taken.isError).toBe(true);
    expect(textOf(taken)).toContain('already exists');
    expect(documents['sample']).toBe(doc('Sample'));
  });

  it('rejects a broken new document without creating it', async () => {
    const result = await client.callTool({ name: 'create_cv', arguments: { id: 'fresh', html: '<p>cut' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('- The document must end with </html>');
    expect(documents).not.toHaveProperty('fresh');
  });

  it('tells Claude in the handshake to read the template before writing', () => {
    const instructions = client.getInstructions();
    expect(instructions).toContain('call read_template');
    expect(instructions).toContain('classic@0.0.2');
  });

  it("returns a template's rules with its example, and names the templates for an unknown one", async () => {
    const result = await client.callTool({ name: 'read_template', arguments: { template: 'classic@0.0.2' } });
    expect(textOf(result)).toBe('# Rules\n\n## Example document\n\n```html\n<!doctype html>\n```\n');

    const unknown = await client.callTool({ name: 'read_template', arguments: { template: 'modern@1.0.0' } });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('Templates: classic@0.0.2');
  });

  it('rejects arguments that do not match the input schema', async () => {
    const result = await client.callTool({ name: 'write_cv', arguments: { id: 'sample' } });
    expect(result.isError).toBe(true);
  });

  it('reports every tool call', async () => {
    await client.callTool({ name: 'list_cvs', arguments: {} });
    await client.callTool({ name: 'read_cv', arguments: { id: 'sample' } });
    await client.callTool({ name: 'write_cv', arguments: { id: 'sample', html: documents['sample']! } });
    expect(toolCalls).toBe(3);
  });
});
