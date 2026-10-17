// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

/** Framework capability contract, not an implemented mutual-authentication service.
 * No Runtime dependency is required for existing registration/discovery workflows.
 * A future authenticated local adapter probes this contract before accepting work.
 */
export interface IdentityVerificationCapabilities {
  contractVersion: 1;
  profile: 'oan-session-v1';
  workflow: boolean;
  requiresSidecar: false;
  businessProtection: boolean;
}
export const COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES: IdentityVerificationCapabilities = Object.freeze({
  contractVersion: 1, profile: 'oan-session-v1', workflow: false,
  requiresSidecar: false, businessProtection: false,
});
/** Trusted local adapter only, never passed through CLI --input or peer messages.
 * This check is availability negotiation, not identity or backend authentication.
 */
export function requireIdentityVerificationBackend(capabilities?: IdentityVerificationCapabilities): void {
  if (!capabilities || capabilities.contractVersion !== 1 || capabilities.profile !== 'oan-session-v1'
    || capabilities.workflow !== true || capabilities.requiresSidecar !== false) {
    throw new Error('identity_verification_backend_unavailable');
  }
}
export function identityVerificationUnavailable() {
  return {
    ok: false as const,
    errorCode: 'identity_verification_backend_unavailable',
    errorMessage: 'Mutual identity verification is planned, but no authenticated local workflow adapter is configured. Registration and discovery remain available.',
  };
}
