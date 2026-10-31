// Domain layer: types, ports (interfaces) and pure logic. No I/O and no imports
// from other layers or third-party runtime packages (ADR-0010).
export { type CvId, type CvSummary, isValidCvId } from './cv/cv.ts';
export { checkCvDocument } from './document/cv-document.ts';
export {
  type CanonicalCvHtml,
  type CvDocumentValidation,
  type CvTemplateRef,
  validateCvDocument,
} from './document/validate-cv-document.ts';
export {
  type ClassRule,
  checkMarkup,
  type MarkupElement,
  type MarkupSchema,
  type ParsedMarkup,
  type ParseMarkup,
} from './markup/cv-markup.ts';
export {
  checkPdf,
  type InspectPdf,
  type PageLink,
  type PageSnapshot,
  type PdfFacts,
  type PdfFont,
  type PdfProblem,
  type RenderCv,
  type RenderedCv,
} from './pdf/cv-pdf.ts';
export type { CvRepository } from './cv/cv-repository.ts';
export type {
  CvListing,
  CvStore,
  NewCv,
  NewRevision,
  RevisionAuthor,
  RevisionKind,
  StoredRevision,
  WriteResult,
} from './cv/cv-store.ts';
export {
  type TemplateCatalog,
  type TemplateGuide,
  type TemplateStylesResult,
  withTemplateStyles,
} from './template/cv-template.ts';
export { readCvTitle } from './document/cv-title.ts';
