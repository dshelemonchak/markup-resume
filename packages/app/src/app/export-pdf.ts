import { checkPdf, type CvRepository, type InspectPdf, isValidCvId, type RenderCv } from '../domain/index.ts';

/** What exporting a CV to PDF needs: the stored CVs, a browser to print with, and a PDF reader to check with. */
export interface PdfExportServices {
  readonly repository: CvRepository;
  readonly renderCv: RenderCv;
  readonly inspectPdf: InspectPdf;
}

export type ExportCvPdfResult =
  | { readonly kind: 'invalid-id' }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'exported';
      readonly pdf: Uint8Array;
      /** File name for the download, from the document's <title>. */
      readonly fileName: string;
      /** What the PDF check found; empty when the PDF reads like the page. */
      readonly problems: readonly string[];
    };

/**
 * Prints a CV to PDF and checks the result against the page (ADR-0009). The PDF comes back either way: whether
 * a PDF with problems is handed out is the caller's decision.
 */
export async function exportCvPdf(services: PdfExportServices, id: string): Promise<ExportCvPdfResult> {
  if (!isValidCvId(id)) return { kind: 'invalid-id' };
  if ((await services.repository.getDocument(id)) === null) return { kind: 'not-found' };
  const { pdf, page } = await services.renderCv(id);
  const problems = checkPdf(page, await services.inspectPdf(pdf));
  return { kind: 'exported', pdf, fileName: pdfFileName(page.title, id), problems };
}

/** "Alex Morgan – Senior Engineer" → "Alex Morgan – Senior Engineer.pdf"; characters file systems refuse go. */
export function pdfFileName(title: string, id: string): string {
  const name = title
    .replace(/[\p{Cc}\\/:*?"<>|]+/gu, ' ') // control characters, and what file systems refuse
    .replace(/\s+/g, ' ')
    .trim();
  return `${name || id}.pdf`;
}
