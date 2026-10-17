// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES as capabilities, requireIdentityVerificationBackend, identityVerificationUnavailable } from '../src/identity-verification.js';
import {inspectCommunityEvidence} from '../src/evidence.js';

test('capabilities cannot advertise unimplemented mutual verification as available', () => {
  assert.equal(capabilities.workflow, false);
  assert.equal(capabilities.businessProtection, false);
  assert.equal(capabilities.requiresSidecar, false);
  assert.throws(() => requireIdentityVerificationBackend(), /backend_unavailable/);
  assert.throws(() => requireIdentityVerificationBackend(capabilities), /backend_unavailable/);
  assert.doesNotThrow(() => requireIdentityVerificationBackend({ ...capabilities, workflow: true }));
  assert.equal(identityVerificationUnavailable().ok, false);
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
