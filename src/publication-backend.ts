// Copyright (c) 2026 OpenAgenet contributors
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com
import {canonicalJson,hashDidDocumentWithProof} from '@openagenet/oan-sdk-ts';
import type {ResourceRegistrationResponse, ResourceRegistrationSubmission} from '@openagenet/oan-sdk-ts/protocol-types';
import {createHash} from 'node:crypto';
import {createOanClient} from './client-factory.js';
import {prepareRegistrationForHost,assertSubmissionProofFresh} from './registration.js';
import {saveRegistrationFiles} from './registration-files.js';
import {registrationCredentialWithSkill} from './query.js';
import type {CommunityEvidenceBackend} from './evidence.js';
import {inspectCommunityEvidence} from './evidence.js';
import type {OanSkillProfile,RegistrationSkillInput} from './types.js';
import {loadIdentityStoreSnapshot} from './registration-state.js';
import {selectDiscoveryEndpoint} from './profiles.js';
import {OanHttpError} from '@openagenet/oan-sdk-ts/client';

interface Candidate {identityRef:string;submission:ResourceRegistrationSubmission}
interface Attempt {resourceDid:string;candidateDigest:string}
/** Structural Runtime PublicationBackend implementation. Identity/key paths stay in the host closure.
 * Input preparation/approval is a host responsibility; model JSON never chooses identity files.
 */
export function createCommunityPublicationBackend(options:{profile:OanSkillProfile;fetchImpl?:typeof fetch;evidence:CommunityEvidenceBackend;
  bindings:Record<string,{identityDir:string;controllerIdentityId?:string;
    prepare(description:unknown):Promise<RegistrationSkillInput>}>}) {
  const client=createOanClient(options.profile,options);
  const binding=(ref:string)=>{const b=Object.hasOwn(options.bindings,ref)?options.bindings[ref]:undefined;if(!b)throw new Error('identity_access_denied');return b;};
  const candidate=(value:unknown)=>{const c=value as Candidate;if(!c?.submission?.resourceDid || !c.identityRef)throw new Error('publication_candidate_invalid');binding(c.identityRef);return c;};
  const confirmed=async(a:Attempt,c:Candidate)=>{
    const {package:pkg}=await client.getDiscoveryResource(a.resourceDid);
    if(!pkg || c.submission.resourceDid!==a.resourceDid || pkg.resourceDid!==a.resourceDid || pkg.packageVersion!==c.submission.packageVersion ||
      pkg.packageHash!==c.submission.packageHash || pkg.metadataHash!==c.submission.metadataHash ||
      !c.submission.didDocumentHash || (await hashDidDocumentWithProof(pkg.didDocument)).replace(/^sha256:/,'')!==c.submission.didDocumentHash.replace(/^sha256:/,''))return undefined;
    const check=await inspectCommunityEvidence({expectedDid:a.resourceDid,didDocument:pkg.didDocument,resourcePackage:pkg},options.evidence);
    return check.ok?pkg:undefined;
  };
  return {
    async preflight(value:unknown){assertSubmissionProofFresh(candidate(value).submission);},
    rejectedBeforeAcceptance(error:unknown){
      if(!(error instanceof OanHttpError) || error.status!==409)return false;
      const body=error.body as Record<string,unknown>|null;
      const code=body?.code??body?.error??body?.message;
      return code==='resource_version_conflict';
    },
    async prepare(identityRef:string,description:unknown){
      const b=binding(identityRef),input=await b.prepare(structuredClone(description));
      const submission=await prepareRegistrationForHost(options.profile,{...input,identityDir:b.identityDir},options);
      return {resourceDid:submission.resourceDid,candidate:JSON.parse(JSON.stringify({identityRef,submission}))};
    },
    async submit(value:unknown,_idempotencyKey:string){
      const c=candidate(value),b=binding(c.identityRef);
      assertSubmissionProofFresh(c.submission);
      // Do not invoke automatic version retries or re-sign after the host approved the digest.
      const response=await client.registerResource(c.submission);
      const files=await saveRegistrationFiles(b.identityDir,c.submission,response);
      return {response,materialDirectory:files.directory};
    },
    async reconcile(a:Attempt,value:unknown){
      const c=candidate(value);
      if('sha256:'+createHash('sha256').update(canonicalJson(c),'utf8').digest('hex')!==a.candidateDigest)throw new Error('publication_candidate_invalid');
      try {
        const pkg=await confirmed(a,c);
        if(!pkg)return {kind:'unknown' as const};
        return {kind:'confirmed' as const,evidence:{resourceDid:pkg.resourceDid,documentDigest:a.candidateDigest,packageVersion:pkg.packageVersion,
          registrarVersion:pkg.packageVersion,source:selectDiscoveryEndpoint(options.profile),evidenceRef:pkg.packageHash}};
      }catch{return {kind:'unknown' as const};}
    },
    async recoverResult(a:Attempt,value:unknown){
      const c=candidate(value),b=binding(c.identityRef);
      if('sha256:'+createHash('sha256').update(canonicalJson(c),'utf8').digest('hex')!==a.candidateDigest)throw new Error('publication_candidate_invalid');
      if(!await confirmed(a,c))throw new Error('publication_material_recovery_required');
      const snapshot=await loadIdentityStoreSnapshot(b.identityDir);
      const ownerDid=c.submission.didDocument.oanMetadata?.controllerDid??a.resourceDid;
      const controllerIdentityId=b.controllerIdentityId??[...snapshot.agents,...snapshot.subjects].find(r=>r.did===ownerDid)?.id;
      const vc=await registrationCredentialWithSkill(options.profile,{resourceDid:a.resourceDid,identityDir:b.identityDir,controllerIdentityId},options);
      if(!vc.ok || !vc.data)throw new Error('publication_material_recovery_required');
      // A recovery receipt is explicit about its origin; never fabricate a Registrar acceptance response.
      const response:ResourceRegistrationResponse={status:'recovered-from-discovery',resourceDid:a.resourceDid,registrationCredential:vc.data.registrationCredential};
      const files=await saveRegistrationFiles(b.identityDir,c.submission,response);
      return {response,materialDirectory:files.directory};
    },
  };
}
