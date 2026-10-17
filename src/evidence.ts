// Copyright (c) 2026 OpenAgenet contributors
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com
/** Optional trusted-host L1 adapter. No Runtime dependency and no peer-supplied policy. */
export interface CommunityEvidenceBackend {
  verify(input: { expectedDid: string; didDocument: unknown; resourcePackage?: unknown; registrationVc?: unknown }): Promise<{
    valid: boolean; checks: Array<{name: string; status: string; code?: string}>;
  }>;
}
export async function inspectCommunityEvidence(input: Parameters<CommunityEvidenceBackend['verify']>[0], backend?: CommunityEvidenceBackend) {
  if (!backend) return {ok:false as const,errorCode:'identity_evidence_backend_unavailable'};
  // Only evidence crosses this boundary. Caller, anchor, clock and node policies are host-owned.
  if (!input || typeof input.expectedDid!=='string' || !input.didDocument ||
      Object.keys(input).some(key=>!['expectedDid','didDocument','resourcePackage','registrationVc'].includes(key))) {
    return {ok:false as const,errorCode:'invalid_identity_evidence'};
  }
  try {
    const report=await backend.verify(structuredClone(input));
    const required=['documentSignature','documentBinding','registrationTrust','freshness','registrationStatus'];
    if (!report || !Array.isArray(report.checks) || !required.every(name=>report.checks.some(c=>c.name===name && c.status==='passed')) || report.valid!==true) {
      return {ok:false as const,errorCode:'identity_evidence_not_verified',data:report};
    }
    return {ok:true as const,data:report};
  } catch {return {ok:false as const,errorCode:'identity_evidence_verification_failed'};}
}
