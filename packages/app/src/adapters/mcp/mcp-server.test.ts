import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CvRepository } from '../../domain/index.ts';
import { createMcpServer } from './mcp-server.ts';

const doc = (title: string) => `<!doctype html><html><meta name="cv:title" content="${title}"></html>`;

let documents: Record<string, string>;
let client: Client;

/** A real MCP client talking to the server over linked in-memory transports: the whole protocol, no stdio. */
beforeEach(async () => {
  documents = { sample: doc('Sample') };
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
    watch: () => () => {},
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([createMcpServer(repository).connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text?: string }[];
  return first?.text ?? '';
}

describe('MCP server', () => {
  it('advertises the three tools with input schemas and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['list_cvs', 'read_cv', 'write_cv']);
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

  it('rejects arguments that do not match the input schema', async () => {
    const result = await client.callTool({ name: 'write_cv', arguments: { id: 'sample' } });
    expect(result.isError).toBe(true);
  });
});
