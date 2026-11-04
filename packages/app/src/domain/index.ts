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
  TogglePinnedResult,
} from './resume/resume-repository.ts';
export {
  type TemplateCatalog,
  type TemplateGuide,
  type TemplateStylesResult,
  type TemplateVariant,
  withTemplateStyles,
} from './template/template.ts';
export type { ExternalIdentity, IdentityProviderName, User } from './user/user.ts';
export type { CreateUserResult, UserRepository } from './user/user-repository.ts';
export type { IdentifyResult, IdentityProvider } from './user/identity-provider.ts';
export {
  type Session,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_LIFETIME_MS,
  SESSION_TOUCH_INTERVAL_MS,
  sessionExpiresAt,
  sessionIdleCutoff,
  sessionNeedsTouch,
} from './session/session.ts';
export type { NewSession, SessionRepository } from './session/session-repository.ts';
export { readResumeTitle } from './document/resume-title.ts';
export { upgradeLegacyVocabulary } from './document/legacy-vocabulary.ts';
export {
  ACCESS_TOKEN_LIFETIME_MS,
  AUTHORIZATION_CODE_LIFETIME_MS,
  isAllowedRedirectUri,
  isValidCodeChallenge,
  isValidCodeVerifier,
  type OAuthClient,
  REFRESH_TOKEN_LIFETIME_MS,
} from './oauth/oauth.ts';
export type {
  AccessGrant,
  AuthorizationCode,
  ConsumeCodeResult,
  NewAuthorizationCode,
  NewTokenFamily,
  NewTokens,
  OAuthClientRepository,
  OAuthGrantRepository,
  RotateRefreshTokenResult,
} from './oauth/oauth-repository.ts';
