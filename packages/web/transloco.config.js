// Transloco Keys Manager (`pnpm i18n`): finds keys the code uses that public/i18n/en.json lacks, and the
// other way round. Keys passed to a translate function in TypeScript are listed in /** t(…) */ comments
// next to where they are used, since the tool reads templates and comments, not running code.
module.exports = {
  rootTranslationsPath: 'public/i18n/',
  langs: ['en'],
  keysManager: {
    input: ['src/app'],
    unflat: true,
  },
};
