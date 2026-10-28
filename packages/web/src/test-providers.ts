// Providers for every unit test (angular.json, test.providersFile): the English dictionary, loaded
// synchronously, so components render their real text.
import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../public/i18n/en.json';

export default [
  importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { en },
      translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      preloadLangs: true,
    }),
  ),
];
