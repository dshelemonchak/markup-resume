import {
  checkPdf,
  type ResumeRepository,
  type PdfInspector,
  isValidResumeSlug,
  type PdfProblem,
  type PdfRenderer,
  type TemplateCatalog,
  type TemplateVariant,
  withTemplateStyles,
} from '../../domain/index.ts';

/**
 * What exporting a CV to PDF needs: the stored CVs, a browser to print with, a PDF reader to check with, and the
 * templates, for the ATS version.
 */
export interface PdfExportDependencies {
  readonly repository: ResumeRepository;
  readonly renderPdf: PdfRenderer;
  readonly inspectPdf: PdfInspector;
  readonly templates: TemplateCatalog;
}

export type ExportResumePdfResult =
  | { readonly kind: 'invalid-slug' }
  | { readonly kind: 'not-found' }
  /** The ATS version was asked for, and the CV's template has none. */
  | { readonly kind: 'no-variant'; readonly problem: string }
  | {
      readonly kind: 'exported';
      readonly pdf: Uint8Array;
      /** File name for the download, from the document's <title>. */
      readonly fileName: string;
      /** What the PDF check found; empty when the PDF reads like the page. */
      readonly problems: readonly PdfProblem[];
    };

/**
 * Prints a CV to PDF and checks the result against the page (ADR-0009), in the visual version or the ATS one
 * (ADR-0005), which restyles the same document. The PDF comes back either way: whether a PDF with problems is
 * handed out is the caller's decision.
 */
export async function exportResumePdf(
  dependencies: PdfExportDependencies,
  slug: string,
  variant: TemplateVariant = 'visual',
): Promise<ExportResumePdfResult> {
  if (!isValidResumeSlug(slug)) {
    return { kind: 'invalid-slug' };
  }
  const revision = await dependencies.repository.read(slug);
  if (revision === null) {
    return { kind: 'not-found' };
  }
  let html = revision.html;
  if (variant === 'ats') {
    const restyled = withTemplateStyles(revision.html, dependencies.templates, 'ats');
    if (restyled.kind === 'problem') {
      return { kind: 'no-variant', problem: restyled.problem };
    }
    html = restyled.html;
  }
  const { pdf, page } = await dependencies.renderPdf(html);
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
