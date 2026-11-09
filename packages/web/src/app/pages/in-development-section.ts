/** A section of the app that is not built yet. */
export type Section = 'applications' | 'masterFile' | 'templates' | 'account';

/** Base name of the section's pictures in `public/illustrations/in-development/`. */
export const SECTION_PICTURES: Readonly<Record<Section, string>> = {
  applications: 'applications',
  masterFile: 'master-file',
  templates: 'templates',
  account: 'account',
};
