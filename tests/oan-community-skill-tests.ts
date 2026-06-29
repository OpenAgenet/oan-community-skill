// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanSkill } from "../src/index.js";
import type { ResourceRegistrationSubmission } from "../../oan-sdk-ts/packages/protocol-types/src/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createFetchStub(
  routes: Record<string, { status?: number; body: unknown }>,
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url}`;
    const match = routes[key];
    if (!match) {
      return new Response(JSON.stringify({ error: "not_found", key }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(match.body), {
      status: match.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const resourceDid = "did:oan:SKDM:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz";
const submission: ResourceRegistrationSubmission = {
  resourceDid,
  resourceType: "skill",
  didDocument: {
    id: resourceDid,
    oanMetadata: {
      subjectType: "skill",
      resourceType: "skill",
      authorizedDomains: ["legal"],
    },
  },
  packageVersion: "1.0.0",
  metadataHash: "sha256:metadata",
  packageHash: "sha256:package",
  hashAlgorithm: "sha256",
};

const fetchStub = createFetchStub({
  "POST https://registrar.example/resources/register": {
    body: { status: "submitted", resourceDid, resourceType: "skill" },
  },
  "GET https://registrar.example/registrar/status": {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
  "GET https://registrar.example/registrar/root-authorization": {
    body: {
      registrarDid: "did:oan:INRG:test",
      rootReachable: true,
      authorization: { status: "authorized" },
    },
  },
  "POST https://registrar.example/capability-tags/suggest": {
    body: { suggestions: ["protocol.mcp"] },
  },
  [`GET https://registrar.example/resources/${encodeURIComponent(resourceDid)}`]: {
    body: { resourceDid, record: { resourceDid, status: "submitted" } },
  },
  "GET https://root.example/root/status": {
    body: { status: "ok", latestVersionCount: 1, cdnReadyQueueCount: 0 },
  },
  [`GET https://root.example/root/resources/${encodeURIComponent(resourceDid)}`]: {
    body: { resourceDid, package: { resourceDid, packageVersion: "1.0.0" } },
  },
  "GET https://cdn.example/cdn/status": {
    body: { status: "ok", resourceCount: 1 },
  },
  [`GET https://cdn.example/cdn/resources/${encodeURIComponent(resourceDid)}`]: {
    body: {
      resourceDid,
      resourceType: "skill",
      packageVersion: "1.0.0",
      didDocument: { id: resourceDid },
      didDocumentHash: "sha256:did",
      metadataHash: "sha256:metadata",
      packageHash: "sha256:package",
      hashAlgorithm: "sha256",
      metadata: {
        resourceDid,
        resourceType: "skill",
        subjectType: "skill",
        name: "Skill",
        lifecycleState: "active",
        packageVersion: "1.0.0",
        packageHash: "sha256:package",
        metadataHash: "sha256:metadata",
        hashAlgorithm: "sha256",
        updatedAt: "2026-06-23T00:00:00Z",
      },
      rootProof: { rootDid: "did:oan:AGRT:test" },
      createdAt: "2026-06-23T00:00:00Z",
    },
  },
  "GET https://discovery.example/discovery/status": {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
  "GET https://discovery.example/discovery/root-authorization": {
    body: {
      discoveryDid: "did:oan:INDS:test",
      rootReachable: true,
      status: "authorized",
      authorizedDomains: ["technology.software_engineering"],
    },
  },
  "GET https://discovery.example/discovery/authorized-domains": {
    body: {
      discoveryDid: "did:oan:INDS:test",
      authorizedDomains: ["technology.software_engineering"],
    },
  },
  "POST https://discovery.example/discovery/resources/query": {
    body: {
      discoveryDid: "did:oan:INDS:test",
      candidates: [{ resourceDid, resourceType: "skill", score: 1 }],
      createdAt: "2026-06-23T00:00:00Z",
    },
  },
  "POST https://discovery.example/discovery/index/resources/visibility": {
    body: { resourceDids: [resourceDid], visible: [resourceDid] },
  },
  "POST https://discovery.example/discovery/query/explain": {
    body: {
      query: { resourceType: "skill", limit: 5 },
      items: [{ resourceDid, resourceType: "skill", matched: true, score: 1 }],
      candidateCount: 1,
      usedIndexedPrefilter: true,
    },
  },
  "GET https://indexer.example/v1/subjects/2/did%3Aoan%3AINDS%3Atest/governance-active": {
    body: {
      governance_active: true,
      authorized: true,
      subject_type: "discovery",
      subject_type_code: 2,
      subject_did: "did:oan:INDS:test",
      status: "active",
    },
  },
});

const skill = new OanSkill(
  {
    nodeSelectionMode: "custom-only",
    customRegistrarEndpoints: ["https://registrar.example"],
    customDiscoveryEndpoints: ["https://discovery.example"],
    rootReferenceEndpoint: "https://root.example",
    cdnReferenceEndpoint: "https://cdn.example",
    trustIndexerEndpoint: "https://indexer.example",
    allowGovernanceStateReads: true,
  },
  { fetchImpl: fetchStub },
);

const validation = skill.validate({ submission });
assert(validation.ok, "validation should pass");
assert(validation.stage === "draft-prepared", "validation stage mismatch");

const missingDomainValidation = skill.validate({
  submission: {
    ...submission,
    didDocument: {
      ...submission.didDocument,
      oanMetadata: {
        subjectType: "skill",
        resourceType: "skill",
      },
    },
  },
});
assert(!missingDomainValidation.ok, "missing authorizedDomains should fail validation");
assert(
  missingDomainValidation.errorMessage === "resource_domains_required",
  "missing authorizedDomains error mismatch",
);

const mixedWildcardValidation = skill.validate({
  submission: {
    ...submission,
    didDocument: {
      ...submission.didDocument,
      oanMetadata: {
        subjectType: "skill",
        resourceType: "skill",
        authorizedDomains: ["*", "legal"],
      },
    },
  },
});
assert(!mixedWildcardValidation.ok, "mixed wildcard domains should fail validation");
assert(
  mixedWildcardValidation.errorMessage === "invalid_authorized_domains",
  "mixed wildcard authorizedDomains error mismatch",
);

const registration = await skill.register({ submission });
assert(registration.ok, "registration should pass");
assert(registration.stage === "visible-in-discovery", "registration stage mismatch");

const identityDir = await mkdtemp(join(tmpdir(), "oan-community-skill-test-"));
try {
  const generatedRegistration = await skill.register({
    identityDir,
    generateIdentity: {
      resourceLabel: "Generated Test Skill",
      resourceType: "skill",
      description: "Generated through local identity mode.",
      capabilityTags: ["generated.skill"],
      authorizedDomains: ["legal"],
      manifestUrl: "https://example.org/skills/generated.json",
    },
  });
  assert(generatedRegistration.ok, "generated registration should pass");
  assert(generatedRegistration.data?.subjectIdentity?.did, "generated registration should return subject identity");
  assert(generatedRegistration.data?.agentIdentity?.did, "generated registration should return agent identity");
  assert(
    generatedRegistration.data?.agentIdentity?.profile.authorizedDomains?.[0] === "legal",
    "generated registration should retain authorized domains",
  );
} finally {
  await rm(identityDir, { recursive: true, force: true });
}

const discovery = await skill.discover({ query: { resourceType: "skill", limit: 5 } });
assert(discovery.ok, "discovery should pass");
assert(discovery.data?.response.candidates.length === 1, "discovery candidate count mismatch");
assert(discovery.data?.explanation?.candidateCount === 1, "discovery explanation mismatch");

const lifecycle = await skill.lifecycle({ resourceDid });
assert(lifecycle.ok, "lifecycle should pass");
assert(lifecycle.data?.snapshot.discoveryVisible, "lifecycle visibility mismatch");

const governance = await skill.governanceAssist({
  subjectRole: "discovery",
  subjectDid: "did:oan:INDS:test",
});
assert(governance.ok, "governance assist should pass");
assert(governance.data?.decision.authorized, "governance decision mismatch");

const operator = await skill.operatorAssist({ resourceDid });
assert(operator.ok, "operator assist should pass");
assert(operator.data?.registrarReachable, "registrar should be reachable");
assert(operator.data?.discoveryReachable, "discovery should be reachable");
assert(
  operator.data?.discoveryAuthorizedDomains?.authorizedDomains?.[0] === "technology.software_engineering",
  "operator assist authorized domains mismatch",
);

const capabilityAssist = await skill.capabilityAssist({ query: "mcp server" });
assert(capabilityAssist.ok, "capability assist should pass");
assert(
  capabilityAssist.data?.suggestions.suggestions?.[0] === "protocol.mcp",
  "capability assist suggestions mismatch",
);

console.log("oan-community-skill tests passed");
