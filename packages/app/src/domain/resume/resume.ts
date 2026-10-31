/** The human-readable name of a resume within its owner's resumes: what Claude and the URLs use. Never changes. */
export type ResumeSlug = string;

const RESUME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs are lower-case words joined by single hyphens, up to 100 characters. Anything else is rejected, which also
 * rules out path tricks such as "../" or absolute paths.
 */
export function isValidResumeSlug(value: string): value is ResumeSlug {
  return value.length <= 100 && RESUME_SLUG.test(value);
}
