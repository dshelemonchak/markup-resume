import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { InspectPdf, PdfFacts, PdfFont } from '../../domain/index.ts';

const run = promisify(execFile);

/**
 * The domain's InspectPdf port on poppler's command-line tools, installed in the image (ADR-0009):
 * pdffonts for the fonts, pdftotext -raw for the text in content-stream order, pdftohtml -xml for the links.
 */
export const inspectPdf: InspectPdf = async (pdf) => {
  const dir = await mkdtemp(join(tmpdir(), 'cv-kit-pdf-'));
  try {
    const file = join(dir, 'cv.pdf');
    await writeFile(file, pdf);
    const [fonts, text, xml] = await Promise.all([
      run('pdffonts', [file]),
      run('pdftotext', ['-raw', '-enc', 'UTF-8', file, '-']),
      run('pdftohtml', ['-xml', '-i', '-stdout', '-q', file]),
    ]);
    return {
      fonts: parseFonts(fonts.stdout),
      text: text.stdout,
      links: parseLinks(xml.stdout),
    } satisfies PdfFacts;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * pdffonts prints a header, a dashed line, then one font per line:
 *   name  type (may contain spaces)  encoding  emb  sub  uni  object  generation
 */
export function parseFonts(output: string): PdfFont[] {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.startsWith('---')) + 1;
  return lines
    .slice(start)
    .filter((line) => line.trim())
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      const [emb, , uni] = fields.slice(-5);
      return {
        name: fields[0]!,
        type: fields.slice(1, -6).join(' '),
        embedded: emb === 'yes',
        unicode: uni === 'yes',
      };
    });
}

/** pdftohtml -xml marks a link's text as <a href="…">. */
export function parseLinks(xml: string): string[] {
  return [...xml.matchAll(/<a href="([^"]*)"/g)].map(([, href]) => decodeXml(href!));
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
