// Copyright (c) 2026 OpenAgenet contributors
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com
import {requireIdentityVerificationBackend,type IdentityVerificationCapabilities} from './identity-verification.js';

/** Installed/authenticated local host only. Never construct this adapter from peer JSON. */
export interface CommunityIdentityBackend {
  capabilities:IdentityVerificationCapabilities;
  call(name:string,input:unknown):Promise<unknown>;
}
export type CommunityIdentityAction='begin'|'accept'|'advance'|'inspect'|'close';
const actions=new Set(['begin','accept','advance','inspect','close']);
const publicCodes=new Set(['invalid_tool_arguments','host_only_argument','policy_denied','scope_denied','session_access_denied',
  'session_not_authenticated','session_evidence_changed','session_expired','session_closed','vault_locked','generation_conflict',
  'invalid_verification_scope','invalid_handshake_message','handshake_binding_invalid','handshake_signature_invalid',
  'handshake_transcript_invalid','handshake_transition_invalid','evidence_unknown_or_expired','replay_detected',
  'operation_already_submitted','operation_id_conflict','invocation_result_unknown','message_signature_invalid',
  'message_binding_mismatch','invocation_binding_or_evidence_invalid','protection_required']);
function safeCode(error:unknown,fallback:string){const code=(error as {code?:unknown})?.code;return typeof code==='string' && publicCodes.has(code)?code:fallback;}
/** Uses Runtime's public workflow tools. It neither reads a key nor implements handshake crypto. */
export async function communityVerifyIdentity(input:{action:CommunityIdentityAction;input?:unknown;message?:unknown;sessionRef?:string},backend?:CommunityIdentityBackend){
  try{
    requireIdentityVerificationBackend(backend?.capabilities);
    if(!input || !actions.has(input.action) || Object.keys(input).some(k=>!['action','input','message','sessionRef'].includes(k)))return {ok:false,errorCode:'invalid_identity_verification_input'};
    const snapshot=structuredClone(input),{action,...args}=snapshot;
    // Only explicitly selected public fields cross the local host boundary.
    const data=await backend!.call('identity.verification.'+action,args);
    return {ok:true,data};
  }catch(error){return {ok:false,errorCode:safeCode(error,backend?'identity_verification_failed':'identity_verification_backend_unavailable')};}
}
export async function communityProtectedCall(input:{routeRef:string;sessionRef:string;requestId?:string;payload:unknown},backend?:CommunityIdentityBackend){
  try{
    requireIdentityVerificationBackend(backend?.capabilities);
    if(!backend?.capabilities.businessProtection)return {ok:false,errorCode:'protected_invocation_backend_unavailable'};
    return {ok:true,data:await backend.call('invocation.execute',structuredClone(input))};
  }catch(error){return {ok:false,errorCode:safeCode(error,'protected_invocation_failed')};}
}
