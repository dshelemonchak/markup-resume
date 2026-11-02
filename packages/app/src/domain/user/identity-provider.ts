import type { ExternalIdentity, IdentityProviderName } from './user.ts';

/**
 * Port: an external service the user signs in with over OAuth 2.0 (ADR-0027). The app only learns who signed in;
 * it keeps no token from the provider.
 */
export interface IdentityProvider {
  readonly name: IdentityProviderName;
  /** Where to send the browser to sign in. The provider sends state back unchanged with the callback. */
  authorizationUrl(state: string): string;
  /** Exchanges the code from the callback for who signed in. */
  identify(code: string): Promise<IdentifyResult>;
}

export type IdentifyResult =
  | { readonly kind: 'identified'; readonly identity: ExternalIdentity }
  /** The provider refused the code: expired, already used, or not issued to this app. */
  | { readonly kind: 'rejected' };
