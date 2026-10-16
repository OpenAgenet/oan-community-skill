#!/usr/bin/env node
// Opt-in, read-only contract check. No identities are created or resources registered.
import assert from "node:assert/strict";
import { OanSkill } from "../dist/index.js";
const skill = new OanSkill({
  requestTimeoutMs: 30000,
  retryPolicy: { maxAttempts: 1, delayMs: 0 },
});
const domains = await skill.registrationDomains();
assert(domains.ok, JSON.stringify(domains));
const registrar = await skill.listResources({ source: "registrar", limit: 1 });
assert(registrar.ok, JSON.stringify(registrar));
const discovery = await skill.listResources({ source: "discovery", limit: 1 });
assert(discovery.ok, JSON.stringify(discovery));
const search = await skill.discover({
  query: { resourceType: "skill", limit: 2 },
  includeExplanation: false,
});
assert(search.ok, JSON.stringify(search));
const did = registrar.data.items[0]?.resourceDid;
if (did) {
  const record = await skill.queryResource({
    source: "registrar",
    resourceDid: did,
  });
  assert(record.ok, JSON.stringify(record));
  const status = await skill.registrationCredentialStatus(did);
  assert(status.ok, JSON.stringify(status));
}
const indexedDid = discovery.data.items[0]?.resourceDid;
if (indexedDid) {
  const resource = await skill.queryResource({
    source: "discovery",
    resourceDid: indexedDid,
  });
  assert(resource.ok, JSON.stringify(resource));
}
console.log(
  JSON.stringify({
    ok: true,
    registrarDid: domains.data.registrarDid,
    domainCount: domains.data.domains?.length,
    registrarPageCount: registrar.data.count,
    discoveryPageCount: discovery.data.count,
    candidateCount: search.data.response.candidates.length,
  }),
);
