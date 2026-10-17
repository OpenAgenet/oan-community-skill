// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES as capabilities, requireIdentityVerificationBackend, identityVerificationUnavailable } from '../src/identity-verification.js';

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
