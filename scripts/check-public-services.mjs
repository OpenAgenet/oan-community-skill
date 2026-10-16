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
const assistants = await Promise.all([
  skill.capabilityAssist({
    description: "Software documentation review",
    tags: ["software"],
  }),
  skill.registrationMetadataAssist({
    name: "Documentation helper",
    description: "A software documentation review tool",
    resourceType: "skill",
  }),
  skill.discoveryQueryAssist({ query: "软件文档审查" }),
]);
for (const result of assistants) assert(result.ok, JSON.stringify(result));
assert(Array.isArray(assistants[0].data.suggestions.capabilityTags));
assert(Array.isArray(assistants[0].data.normalized.tags));
assert(Array.isArray(assistants[1].data.suggestions.authorizedDomains));
assert(Array.isArray(assistants[2].data.suggestions.resourceTypes));
const explained = await skill.discover({
  query: { query: "软件文档审查", limit: 2 },
});
assert(explained.ok, JSON.stringify(explained));
const did = registrar.data.items[0]?.resourceDid;
if (did) {
  const record = await skill.queryResource({
    source: "registrar",
    resourceDid: did,
  });
  assert(record.ok, JSON.stringify(record));
  const status = await skill.registrationCredentialStatus(did);
  assert(status.ok, JSON.stringify(status));
  assert.equal(typeof status.data.status, "string");
  assert.equal(status.data.subjectDid, did);
  const lifecycle = await skill.lifecycle({ resourceDid: did });
  assert(lifecycle.ok, JSON.stringify(lifecycle));
}
if (registrar.data.hasMore) {
  const next = await skill.listResources({
    source: "registrar",
    limit: 1,
    afterDid: registrar.data.nextDid,
  });
  assert(next.ok, JSON.stringify(next));
  assert.notEqual(
    next.data.items[0]?.resourceDid,
    registrar.data.items[0]?.resourceDid,
  );
}
if (discovery.data.hasMore) {
  const next = await skill.listResources({
    source: "discovery",
    limit: 1,
    afterCursor: discovery.data.nextCursor,
    afterResourceDid: discovery.data.nextResourceDid,
  });
  assert(next.ok, JSON.stringify(next));
  assert.notEqual(
    next.data.items[0]?.resourceDid,
    discovery.data.items[0]?.resourceDid,
  );
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
    assistantEndpoints: assistants.length,
    explanationAvailable: !!explained.data.explanation,
  }),
);
