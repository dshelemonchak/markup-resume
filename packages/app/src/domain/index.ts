// Domain layer: types, ports (interfaces) and pure logic. No I/O and no imports
// from other layers or third-party runtime packages (ADR-0010).
export { type ResumeSlug, isValidResumeSlug } from './resume/resume.ts';
export { type ResumeAddress, formatResumeAddress, parseResumeAddress } from './resume/resume-address.ts';
export { checkDocumentBasics } from './document/document-basics.ts';
export {
  type CanonicalResumeHtml,
  type ResumeDocumentValidation,
  type TemplateRef,
  validateResumeDocument,
} from './document/validate-resume-document.ts';
export {
  type ClassRule,
  checkMarkup,
  type MarkupElement,
  type MarkupSchema,
  type ParsedHtml,
  type HtmlParser,
} from './markup/markup.ts';
export {
  checkPdf,
  type PdfInspector,
  type PageLink,
  type PageSnapshot,
  type PdfFacts,
  type PdfFont,
  type PdfProblem,
  type PdfRenderer,
  type RenderedResume,
} from './pdf/pdf-check.ts';
export type {
  ResumeListItem,
  ResumeRepository,
  CreateResumeInput,
  WriteRevisionInput,
  RevisionAuthor,
  RevisionKind,
  ResumeRevision,
  WriteRevisionResult,
} from './resume/resume-repository.ts';
export {
  type TemplateCatalog,
  type TemplateGuide,
  type TemplateStylesResult,
  withTemplateStyles,
} from './template/template.ts';
export { readResumeTitle } from './document/resume-title.ts';
export { upgradeLegacyVocabulary } from './document/legacy-vocabulary.ts';
