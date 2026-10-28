import { HttpClient } from '@angular/common/http';
import {
  type EnvironmentProviders,
  Injectable,
  type Provider,
  type Signal,
  computed,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type Translation,
  type TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

/** Languages of the UI; each has public/i18n/<lang>.json. */
export const LANGUAGES = ['en'] as const;
const DEFAULT_LANGUAGE = 'en';

/** The locale that formats dates and numbers for each language (day before month, 24-hour clock in English). */
const LOCALES: Readonly<Record<string, string>> = { en: 'en-GB' };

/** Loads public/i18n/<lang>.json, served next to the app. */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

/**
 * The UI's text comes from Transloco dictionaries. The default language is loaded before the app starts,
 * so no view ever shows a bare key.
 */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return [
    provideTransloco({
      config: {
        availableLangs: [...LANGUAGES],
        defaultLang: DEFAULT_LANGUAGE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: HttpTranslationLoader,
    }),
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load(DEFAULT_LANGUAGE))),
  ];
}

/** The locale of the active language, as a signal, for Intl formatting. Call in an injection context. */
export function injectLocale(): Signal<string> {
  const transloco = inject(TranslocoService);
  const language = toSignal(transloco.langChanges$, { initialValue: transloco.getActiveLang() });
  return computed(() => LOCALES[language()] ?? language());
}

/**
 * Translation for code outside templates (computed text, aria labels built in TS). Reading the returned
 * function inside a computed() or effect() also tracks the active language, so the text follows a language
 * switch. Call in an injection context.
 */
export function injectTranslate(): (key: string, params?: Record<string, unknown>) => string {
  const transloco = inject(TranslocoService);
  const translation = toSignal(transloco.selectTranslation(), { initialValue: {} });
  return (key, params) => {
    translation();
    return transloco.translate(key, params);
  };
}
