// Domain layer: types, ports (interfaces) and pure logic. No I/O and no imports
// from other layers or third-party runtime packages (ADR-0010).
export { type CvId, type CvSummary, isValidCvId } from './cv.ts';
export { checkCvDocument } from './cv-document.ts';
export {
  type ClassRule,
  checkMarkup,
  type MarkupElement,
  type MarkupSchema,
  type ParseMarkup,
} from './cv-markup.ts';
export type { CvRepository } from './cv-repository.ts';
export {
  checkTemplateMarkup,
  type TemplateCatalog,
  type TemplateGuide,
  type TemplateStylesResult,
  withTemplateStyles,
} from './cv-template.ts';
export { readCvTitle } from './cv-title.ts';
