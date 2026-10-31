import {
  checkPdf,
  type ResumeRepository,
  type PdfInspector,
  isValidResumeSlug,
  type PdfProblem,
  type PdfRenderer,
} from '../../domain/index.ts';

/** What exporting a CV to PDF needs: the stored CVs, a browser to print with, and a PDF reader to check with. */
export interface PdfExportDependencies {
  readonly repository: ResumeRepository;
  readonly renderPdf: PdfRenderer;
  readonly inspectPdf: PdfInspector;
}

export type ExportResumePdfResult =
  | { readonly kind: 'invalid-slug' }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'exported';
      readonly pdf: Uint8Array;
      /** File name for the download, from the document's <title>. */
      readonly fileName: string;
      /** What the PDF check found; empty when the PDF reads like the page. */
      readonly problems: readonly PdfProblem[];
    };

/**
 * Prints a CV to PDF and checks the result against the page (ADR-0009). The PDF comes back either way: whether
 * a PDF with problems is handed out is the caller's decision.
 */
export async function exportResumePdf(
  dependencies: PdfExportDependencies,
  slug: string,
): Promise<ExportResumePdfResult> {
  if (!isValidResumeSlug(slug)) {
    return { kind: 'invalid-slug' };
  }
  if ((await dependencies.repository.read(slug)) === null) {
    return { kind: 'not-found' };
  }
  const { pdf, page } = await dependencies.renderPdf(slug);
  const problems = checkPdf(page, await dependencies.inspectPdf(pdf));
  return { kind: 'exported', pdf, fileName: pdfFileName(page.title, slug), problems };
}

/** "Alex Morgan – Senior Engineer" → "Alex Morgan – Senior Engineer.pdf"; characters file systems refuse go. */
export function pdfFileName(title: string, slug: string): string {
  const name = title
    .replace(/[\p{Cc}\\/:*?"<>|]+/gu, ' ') // control characters, and what file systems refuse
    .replace(/\s+/g, ' ')
    .trim();
  return `${name || slug}.pdf`;
}
