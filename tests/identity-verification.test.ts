// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES as capabilities, requireIdentityVerificationBackend, identityVerificationUnavailable } from '../src/identity-verification.js';
import {inspectCommunityEvidence} from '../src/evidence.js';
import {communityVerifyIdentity,communityProtectedCall} from '../src/identity-backend.js';

test('default capabilities require an explicitly installed mutual verification backend', () => {
  assert.equal(capabilities.workflow, false);
  assert.equal(capabilities.businessProtection, false);
  assert.equal(capabilities.requiresSidecar, false);
  assert.throws(() => requireIdentityVerificationBackend(), /backend_unavailable/);
  assert.throws(() => requireIdentityVerificationBackend(capabilities), /backend_unavailable/);
  assert.doesNotThrow(() => requireIdentityVerificationBackend({ ...capabilities, workflow: true }));
  assert.equal(identityVerificationUnavailable().ok, false);
});

test('configured verification and protected calls share host tools; missing capabilities fail closed',async()=>{
  const calls:unknown[]=[];
  const backend={capabilities:{...capabilities,workflow:true,businessProtection:true},async call(name:string,input:unknown){calls.push({name,input});return {state:'pending'};}};
  assert.equal((await communityVerifyIdentity({action:'begin',input:{identityRef:'a'}},backend)).ok,true);
  assert.deepEqual(calls[0],{name:'identity.verification.begin',input:{input:{identityRef:'a'}}});
  assert.equal((await communityVerifyIdentity({action:'unknown'} as any,backend)).ok,false);
  assert.equal((await communityProtectedCall({routeRef:'route',sessionRef:'session',payload:{}},backend)).ok,true);
  assert.equal((await communityProtectedCall({routeRef:'route',sessionRef:'session',payload:{}},{...backend,capabilities:{...backend.capabilities,businessProtection:false}})).ok,false);
  const failed=await communityVerifyIdentity({action:'inspect',sessionRef:'id'},{...backend,async call(){throw new Error('secret-token-private-loader');}});
  assert.equal(failed.ok,false);assert(!JSON.stringify(failed).includes('secret-token'));
  assert.equal((await communityVerifyIdentity({action:'inspect',sessionRef:'id'},{...backend,async call(){throw {code:'session_expired',message:'private-path'};}})).errorCode,'session_expired');
});

test('skill identity entrypoints reject host-only fields and malformed protected calls before backend dispatch',async()=>{
  const calls:string[]=[];const backend={capabilities:{...capabilities,workflow:true,businessProtection:true},async call(name:string){calls.push(name);return {};}};
  assert.deepEqual(await communityVerifyIdentity({action:'begin',input:{callerId:'forged'}},backend),{ok:false,errorCode:'host_only_argument'});
  assert.deepEqual(await communityProtectedCall({routeRef:'r',sessionRef:'s',payload:{tenantId:'forged'}},backend),{ok:false,errorCode:'host_only_argument'});
  assert.deepEqual(await communityProtectedCall({routeRef:'r',sessionRef:'s',payload:[] as any},backend),{ok:false,errorCode:'invalid_protected_call_input'});
  assert.deepEqual(calls,[]);
});

test('CLI exposes capability probe and fails verification without reading identity material', () => {
  const run = (action: string) => spawnSync(process.execPath, ['scripts/oan-community.mjs', action], { encoding: 'utf8' });
  const probe = run('identity-capabilities');
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(JSON.parse(probe.stdout).data.workflow, false);
  const verify = run('verify-identity');
  assert.equal(verify.status, 1, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).errorCode, 'identity_verification_backend_unavailable');
});

test('evidence reports are allowlisted and contradictory backend success is rejected',async()=>{
  const checks=['documentSignature','documentBinding','registrationTrust','freshness','registrationStatus'].map(name=>({name,status:'passed'}));
  const input={expectedDid:'did:oan:test',didDocument:{id:'did:oan:test'}};
  const backend={async verify(){return {valid:true,checks,privateKeyJwk:{d:'must-not-escape'},credential:{secret:'must-not-escape'}};}};
  const good=await inspectCommunityEvidence(input,backend);assert.equal(good.ok,true);assert(!JSON.stringify(good).includes('must-not-escape'));
  checks.push({name:'privateVc',status:'failed'});
  assert.equal((await inspectCommunityEvidence(input,backend)).ok,false);
  assert.equal((await inspectCommunityEvidence(input,{async verify(){return null as any;}})).ok,false);
});

test('community evidence rejects missing dimensions, unknown status and injected host policy',async()=>{
  const input={expectedDid:'did:oan:test',didDocument:{id:'did:oan:test'}};
  let calls=0;
  const checks=['documentSignature','documentBinding','registrationTrust','freshness','registrationStatus'].map(name=>({name,status:'passed'}));
  const backend={async verify(){calls++;return {valid:true,checks};}};
  assert.equal((await inspectCommunityEvidence({...input,trustAnchor:{rootDid:'attacker'}} as any,backend)).ok,false);
  assert.equal(calls,0);
  assert.equal((await inspectCommunityEvidence(input)).ok,false);
  checks.pop();assert.equal((await inspectCommunityEvidence(input,backend)).ok,false);
  checks.push({name:'registrationStatus',status:'unknown'});assert.equal((await inspectCommunityEvidence(input,backend)).ok,false);
  const error=await inspectCommunityEvidence(input,{async verify(){throw new Error('private-loader-secret');}});
  assert.equal(error.ok,false);assert(!JSON.stringify(error).includes('private-loader-secret'));
});

test('community evidence snapshots inputs and filters backend error strings',async()=>{
  const input={expectedDid:'did:oan:test',didDocument:{id:'did:oan:test'}};
  const pending=inspectCommunityEvidence(input,{async verify(received){
    await Promise.resolve();assert.equal((received.didDocument as any).id,'did:oan:test');
    return {valid:true,checks:['documentSignature','documentBinding','registrationTrust','freshness','registrationStatus'].map(name=>({name,status:'passed',code:'secret / private token'}))};
  }});
  input.didDocument.id='changed';const result=await pending;
  assert.equal(result.ok,true);assert(!JSON.stringify(result).includes('private token'));
});
