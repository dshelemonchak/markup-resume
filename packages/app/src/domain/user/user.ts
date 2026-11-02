/** The services a person signs in with (ADR-0025); identity_provider in the database. */
export type IdentityProviderName = 'github' | 'google';

/** A person who signed in. The name comes from the provider and may be missing. */
export interface User {
  readonly id: string;
  readonly name: string | null;
}

/** Who a provider says signed in. A person is found by provider and providerUserId, never by email (ADR-0025). */
export interface ExternalIdentity {
  readonly provider: IdentityProviderName;
  /** The provider's stable id for the account; a GitHub login can change, this cannot. */
  readonly providerUserId: string;
  readonly name: string | null;
  readonly email: string | null;
}
