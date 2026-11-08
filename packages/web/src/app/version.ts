import { InjectionToken } from '@angular/core';

/** Set by the production build (`ng build --define APP_VERSION=…`, see the Dockerfile); absent in `ng serve` and tests. */
declare const APP_VERSION: string | undefined;

/** The release this build belongs to (`v1.2.3`), or `dev` outside a release build. */
export const RELEASE_VERSION = new InjectionToken<string>('RELEASE_VERSION', {
  factory: () => (typeof APP_VERSION === 'undefined' ? '' : APP_VERSION) || 'dev',
});
