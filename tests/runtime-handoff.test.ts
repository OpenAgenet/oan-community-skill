import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeIdentityHandoff } from '../src/runtime-handoff.js';
test('handoff contains paths only and distinguishes missing credentials from verified evidence', () => {
  const partial = createRuntimeIdentityHandoff('did:oan:resource', { directory: 'local', didDocument: 'local/did.json', receipt: 'local/receipt.json' });
  assert.deepEqual(partial.materials.map(m => m.kind), ['did-document']);
  assert.equal(partial.trust, 'requires-runtime-verification');
  const complete = createRuntimeIdentityHandoff('did:oan:resource', { directory: 'local', didDocument: 'local/did.json', receipt: 'local/receipt.json', registrationVc: 'local/vc.json', oanIdentity: 'local/identity.json' }, 'did:oan:controller');
  assert.equal(complete.materials.find(m => m.kind === 'oan-identity')?.sensitivity, 'secret');
  assert.equal(complete.controllerDid, 'did:oan:controller');
  assert.equal(JSON.stringify(complete).includes('privateKeyJwk'), false);
});
