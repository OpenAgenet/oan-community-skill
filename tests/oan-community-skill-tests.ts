// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanSkill } from "../src/index.js";
import { createDefaultProfile, DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS } from "../src/profiles.js";
import type { ResourceRegistrationSubmission } from "../../oan-sdk-ts/packages/protocol-types/src/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createFetchStub(
  routes: Record<string, { status?: number; body: unknown }>,
  capturedRequests: Array<{ key: string; body?: unknown }> = [],
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url}`;
    capturedRequests.push({
      key,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
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
      resourceDescription: {
        name: "Skill",
        description: "Review contracts",
        capabilityTags: ["legal.contract.review"],
      },
      capabilityTags: ["legal.contract.review"],
      implementationLinks: [{ relation: "implements" }],
      credentialRequirements: [
        { credentialType: "OANAccessCredential", scope: { purpose: "invoke" }, required: true } as any,
      ],
    },
  },
  packageVersion: "1.0.0",
  metadataHash: "sha256:metadata",
  packageHash: "sha256:package",
  hashAlgorithm: "sha256",
};

const capturedRequests: Array<{ key: string; body?: unknown }> = [];
const fetchStub = createFetchStub({
  [`GET ${DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl}/registrar/status`]: {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
  [`GET ${DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl}/discovery/status`]: {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
  "GET https://gateway.example/registrar/status": {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
  "GET https://gateway.example/discovery/status": {
    body: { status: "ok", rootAuthorizationStatus: "authorized" },
  },
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
    body: { suggestions: ["protocol.mcp"], capabilityTags: [{ value: "protocol.mcp", score: 0.9 }] },
  },
  "POST https://registrar.example/capability-tags/normalize": {
    body: {
      tags: ["protocol.mcp", "security.audit"],
      capabilityTags: ["protocol.mcp", "security.audit"],
    },
  },
  "GET https://registrar.example/registration/domain-catalog": {
    body: {
      authorizedDomains: ["technology.software_engineering", "legal"],
      wildcard: false,
      domains: [
        { id: "legal", label: "Legal", parent: null, selectable: true },
        {
          id: "technology.software_engineering",
          label: "Software Engineering",
          parent: "technology",
          selectable: true,
        },
      ],
    },
  },
  "POST https://registrar.example/registration/suggestions": {
    body: {
      authorizedDomains: [
        {
          id: "technology.software_engineering",
          label: "Software Engineering",
          score: 0.87,
          covered: true,
          reason: "Matched software development wording.",
          evidence: [{ source: "description", value: "MCP server for developer automation" }],
        },
      ],
      capabilityTags: [{ value: "protocol.mcp", score: 0.91, reason: "Matched MCP protocol wording." }],
      resourceTypeHints: [{ value: "mcp_server", score: 0.8 }],
      protocolHints: [{ value: "mcp", score: 0.8 }],
    },
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
  "POST https://discovery.example/discovery/query/suggestions": {
    body: {
      authorizedDomainHints: [
        {
          id: "technology.software_engineering",
          label: "Software Engineering",
          score: 0.84,
          covered: true,
          reason: "Matched developer tooling query.",
        },
      ],
      capabilityTags: [{ value: "protocol.mcp", score: 0.9 }],
      resourceTypes: [{ value: "mcp_server", score: 0.8 }],
      protocols: [{ value: "mcp", score: 0.8 }],
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
}, capturedRequests);

const communityResourceDid = "did:oan:SKDM:4YvQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LmNo";
const descriptionFetchStub = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" && url === "https://registrar.example/registrar/status") {
    return jsonResponse({ status: "ok", rootAuthorizationStatus: "authorized" });
  }
  if (method === "GET" && url === "https://root.example/root/status") {
    return jsonResponse({ status: "ok", latestVersionCount: 1, cdnReadyQueueCount: 0 });
  }
  if (method === "GET" && url === "https://cdn.example/cdn/status") {
    return jsonResponse({ status: "ok", resourceCount: 1 });
  }
  if (method === "GET" && url === "https://discovery.example/discovery/status") {
    return jsonResponse({ status: "ok", rootAuthorizationStatus: "authorized" });
  }
  if (method === "POST" && url === "https://registrar.example/resources/register") {
    const body = JSON.parse(String(init?.body ?? "{}")) as ResourceRegistrationSubmission;
    return jsonResponse({ status: "submitted", resourceDid: body.resourceDid, resourceType: body.resourceType });
  }
  if (method === "POST" && url === "https://discovery.example/discovery/index/resources/visibility") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { resourceDids?: string[] };
    return jsonResponse({ resourceDids: body.resourceDids ?? [], visible: body.resourceDids ?? [] });
  }
  const registrarMatch = url.match(/^https:\/\/registrar\.example\/resources\/(.+)$/);
  if (method === "GET" && registrarMatch) {
    const did = decodeURIComponent(registrarMatch[1] ?? "");
    return jsonResponse({ resourceDid: did, record: { resourceDid: did, status: "submitted" } });
  }
  const rootVersionsMatch = url.match(/^https:\/\/root\.example\/root\/resources\/(.+)\/versions$/);
  if (method === "GET" && rootVersionsMatch) {
    const did = decodeURIComponent(rootVersionsMatch[1] ?? "");
    return jsonResponse({ resourceDid: did, items: [{ resourceDid: did, packageVersion: "1.0.0" }] });
  }
  const rootMatch = url.match(/^https:\/\/root\.example\/root\/resources\/(.+)$/);
  if (method === "GET" && rootMatch) {
    const did = decodeURIComponent(rootMatch[1] ?? "");
    return jsonResponse({ resourceDid: did, package: { resourceDid: did, packageVersion: "1.0.0" } });
  }
  const cdnMatch = url.match(/^https:\/\/cdn\.example\/cdn\/resources\/(.+)$/);
  if (method === "GET" && cdnMatch) {
    const did = decodeURIComponent(cdnMatch[1] ?? "");
    return jsonResponse({
      resourceDid: did,
      resourceType: "skill",
      packageVersion: "1.0.0",
      didDocument: { id: did },
      didDocumentHash: "sha256:did",
      metadataHash: "sha256:metadata",
      packageHash: "sha256:package",
      hashAlgorithm: "sha256",
      metadata: {
        resourceDid: did,
        resourceType: "skill",
        subjectType: "skill",
        name: "Resource",
        lifecycleState: "active",
        packageVersion: "1.0.0",
        packageHash: "sha256:package",
        metadataHash: "sha256:metadata",
        hashAlgorithm: "sha256",
        updatedAt: "2026-06-23T00:00:00Z",
      },
      rootProof: { rootDid: "did:oan:AGRT:test" },
      createdAt: "2026-06-23T00:00:00Z",
    });
  }
  return new Response(JSON.stringify({ error: "not_found", key: `${method} ${url}` }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function wordCount(value: string | undefined): number {
  return (value ?? "").split(/\s+/).filter(Boolean).length;
}

function descriptionUnitCount(value: string | undefined): number {
  const text = value ?? "";
  if (/[\u3400-\u9fff]/u.test(text)) {
    return Array.from(text).filter((char) => /[\u3400-\u9fffA-Za-z0-9]/u.test(char)).length;
  }
  return wordCount(text);
}

const defaultProfile = createDefaultProfile();
assert(
  defaultProfile.baseUrl === DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl,
  "default profile should point to official baseUrl",
);
assert(
  defaultProfile.officialRegistrarEndpoints?.length === 0 && defaultProfile.officialDiscoveryEndpoints?.length === 0,
  "default profile should use baseUrl before explicit official endpoints",
);

const officialDefaultSkill = new OanSkill(defaultProfile, { fetchImpl: fetchStub });
const defaultOperator = await officialDefaultSkill.operatorAssist({});
assert(defaultOperator.ok, "default official profile should reach official endpoints");
assert(defaultOperator.data?.registrarReachable, "default official registrar should be reachable");
assert(defaultOperator.data?.discoveryReachable, "default official discovery should be reachable");

const gatewaySkill = new OanSkill(
  createDefaultProfile({
    nodeSelectionMode: "custom-only",
    baseUrl: "https://gateway.example",
  }),
  { fetchImpl: fetchStub },
);
const gatewayOperator = await gatewaySkill.operatorAssist({});
assert(gatewayOperator.ok, "custom baseUrl profile should reach gateway endpoints");
assert(gatewayOperator.data?.registrarReachable, "gateway registrar should be reachable");
assert(gatewayOperator.data?.discoveryReachable, "gateway discovery should be reachable");

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
const registrationRequest = capturedRequests.find((request) => request.key === "POST https://registrar.example/resources/register");
assert(registrationRequest?.body, "registration should submit a request body");
const submitted = registrationRequest.body as ResourceRegistrationSubmission & {
  didDocumentHash?: string;
  subjectControlProof?: { challenge?: { didDocumentHash?: string } };
};
assert(/^sha256:[0-9a-f]{64}$/.test(String(submitted.didDocumentHash)), "registration should compute didDocumentHash");
assert(/^sha256:[0-9a-f]{64}$/.test(String(submitted.metadataHash)), "registration should compute metadataHash");
assert(/^sha256:[0-9a-f]{64}$/.test(String(submitted.packageHash)), "registration should compute packageHash");
assert(
  submitted.subjectControlProof?.challenge?.didDocumentHash === submitted.didDocumentHash,
  "subjectControlProof should bind didDocumentHash",
);
assert(
  submitted.didDocument.oanMetadata?.implementationLinks?.[0]?.targetDid === resourceDid,
  "implementationLinks should default targetDid to resourceDid",
);
assert(
  submitted.didDocument.oanMetadata?.implementationLinks?.[0]?.targetType === "skill",
  "implementationLinks should default targetType to resourceType",
);
assert(
  submitted.didDocument.oanMetadata?.credentialRequirements?.[0]?.type === "OANAccessCredential",
  "credential requirements should keep protocol-compatible type",
);
assert(
  submitted.didDocument.oanMetadata?.credentialRequirements?.[0]?.purpose === "invoke",
  "credential requirements should keep protocol-compatible purpose",
);

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

const capabilityAssist = await skill.capabilityAssist({ query: "mcp server", tags: [" Protocol MCP ", "security audit"] });
assert(capabilityAssist.ok, "capability assist should pass");
assert(
  capabilityAssist.data?.suggestions.suggestions?.[0] === "protocol.mcp",
  "capability assist suggestions mismatch",
);
assert(
  capabilityAssist.data?.suggestions.capabilityTags?.[0]?.value === "protocol.mcp",
  "capability assist structured suggestions mismatch",
);
assert(
  capabilityAssist.data?.normalized?.tags[1] === "security.audit",
  "capability assist normalization mismatch",
);

const registrationMetadataAssist = await skill.registrationMetadataAssist({
  name: "Developer MCP Server",
  description: "MCP server for developer automation and software engineering workflows.",
  resourceType: "mcp_server",
});
assert(registrationMetadataAssist.ok, "registration metadata assist should pass");
assert(
  registrationMetadataAssist.data?.suggestions.authorizedDomains[0]?.id === "technology.software_engineering",
  "registration metadata domain suggestion mismatch",
);
assert(
  registrationMetadataAssist.data?.domainCatalog?.domains?.length === 2,
  "registration metadata domain catalog mismatch",
);

const discoveryQueryAssist = await skill.discoveryQueryAssist({
  query: "Find MCP servers for software engineering automation.",
});
assert(discoveryQueryAssist.ok, "discovery query assist should pass");
assert(
  discoveryQueryAssist.data?.suggestions.capabilityTags[0]?.value === "protocol.mcp",
  "discovery query capability suggestion mismatch",
);

const openClawMarkdown = `# android-transfer-skill

android-transfer-skill is a community skill for moving files from a macOS workstation to an Android device while keeping the transfer path explicit and auditable. It is suitable for developers, testers, and content operators who need to copy build artifacts, media files, logs, or test data to a connected Android environment without losing track of the source path, target path, and verification outcome. The skill emphasizes checksum verification and path validation so that a user can confirm whether the transferred file is the expected artifact and whether the destination path is acceptable before downstream automation continues. In OAN registration, this resource should be discoverable as a practical file-transfer skill with clear inputs, outputs, and operator-facing safety checks.

## Source And Access

- Source dataset: \`openclaw-skills\`
- Source URL: <https://github.com/VoltAgent/awesome-openclaw-skills>
- Repository: <Unknown>
- Package or catalog page: <https://clawskills.sh/skills/aadipapp-android-transfer-skill>

## Suggested OAN Registration Metadata

| Field | Suggested value | Notes |
| --- | --- | --- |
| resourceType | \`skill\` | OAN resource category inferred from the source. |
| name | \`android-transfer-skill\` | Human-readable resource name. |
| version | \`1.0.0\` | Observed upstream version. |
| endpoint | \`https://clawskills.sh/skills/aadipapp-android-transfer-skill\` | Homepage. |
| protocol | \`skill\` | Access model. |
| schemaUrl | \`https://clawskills.sh/skills/aadipapp-android-transfer-skill\` | Descriptor URL. |
| downloadUrl | \`https://clawskills.sh/skills/aadipapp-android-transfer-skill\` | Download or page URL. |
| repositoryUrl | \`Unknown\` | Repository URL. |
| packageUrl | \`https://clawskills.sh/skills/aadipapp-android-transfer-skill\` | Catalog page. |
| authorizedDomains | \`technology.software_engineering\` | Registrar domain. |
| capabilityTags | \`skill; android; files; checksum\` | Discovery tags. |
| useCases | \`Transfer files to Android; Verify file checksums\` | Use cases. |
| inputs | \`Source file path; Android target path\` | Inputs. |
| outputs | \`Transfer result; Checksum report\` | Outputs. |
| license | \`Unknown\` | License. |
| maintainer | \`aadipapp\` | Maintainer. |

## Suggested registration description

> android-transfer-skill is a community skill for moving files from a macOS workstation to an Android device while keeping the transfer path explicit and auditable. It is suitable for developers, testers, and content operators who need to copy build artifacts, media files, logs, or test data to a connected Android environment without losing track of the source path, target path, and verification outcome. The skill emphasizes checksum verification and path validation so that a user can confirm whether the transferred file is the expected artifact and whether the destination path is acceptable before downstream automation continues. In OAN registration, this resource should be discoverable as a practical file-transfer skill with clear inputs, outputs, and operator-facing safety checks.
`;
const descriptionSkill = new OanSkill(
  {
    nodeSelectionMode: "custom-only",
    customRegistrarEndpoints: ["https://registrar.example"],
    customDiscoveryEndpoints: ["https://discovery.example"],
    rootReferenceEndpoint: "https://root.example",
    cdnReferenceEndpoint: "https://cdn.example",
  },
  { fetchImpl: descriptionFetchStub },
);
const openClawIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-description-test-"));
try {
  const draft = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: openClawMarkdown,
    identityDir: openClawIdentityDir,
  });
  assert(draft.ok, "OpenClaw markdown should produce a complete draft");
  assert(draft.data?.candidate.name === "android-transfer-skill", "OpenClaw name parse mismatch");
  assert(draft.data?.candidate.resourceType === "skill", "OpenClaw resource type parse mismatch");
  assert(draft.data?.candidate.authorizedDomains[0] === "technology.software_engineering", "domain parse mismatch");
  assert(draft.data?.submission?.resourceDid.startsWith("did:oan:SK"), "skill draft should use SK DID subject code");
  const draftInputs = draft.data?.submission?.didDocument.oanMetadata?.resourceDescription?.inputs;
  assert(
    Array.isArray(draftInputs) && draftInputs[0] === "Source file path",
    "draft should preserve structured inputs",
  );
  assert(
    draft.data?.submission?.didDocument.oanMetadata?.implementationLinks?.some(
      (link) => link.relation === "catalog",
    ),
    "draft should preserve catalog implementation link",
  );

  const registeredFromDescription = await descriptionSkill.registerFromResourceDescription({
    markdown: openClawMarkdown,
    identityDir: openClawIdentityDir,
  });
  assert(registeredFromDescription.ok, "registration from resource description should pass");
  assert(
    registeredFromDescription.data?.candidate.name === "android-transfer-skill",
    "registration should return parsed candidate",
  );
} finally {
  await rm(openClawIdentityDir, { recursive: true, force: true });
}

const huggingFaceMarkdown = `# 0x7o/incoder-api

0x7o/incoder-api is a hosted Hugging Face Space that exposes an Incoder-style programming assistant through a public web endpoint. It is relevant to OAN users who are searching for lightweight agent services that can support code understanding, prompt-driven code generation, or quick experimentation with a hosted model interface. The resource is registered as an agent service rather than as a local package because the primary access path is the public Space URL and its Gradio-compatible interaction surface. Its registration metadata should help Discovery users understand the expected inputs, such as programming prompts or form parameters, and the expected outputs, such as generated text or model responses. The description also records the upstream source and version-like revision so future registrations can update the same resource when the Space changes.

## Suggested OAN Registration Metadata

| Field | Suggested value | Notes |
| --- | --- | --- |
| resourceType | \`agent_service\` | OAN resource category inferred from the source. |
| name | \`0x7o/incoder-api\` | Human-readable resource name. |
| version | \`962bbdd529ac1626e49b9c4ade189a177bcf5b2d\` | Observed upstream version. |
| endpoint | \`https://huggingface.co/spaces/0x7o/incoder-api\` | Public Space URL. |
| protocol | \`huggingface-space/gradio\` | Access model. |
| authorizedDomains | \`technology.software_engineering\` | Registrar domain. |
| capabilityTags | \`api; incoder; gradio\` | Discovery tags. |
| useCases | \`Call or evaluate the online AI service\` | Use case. |
| inputs | \`User prompt; Space-specific form input\` | Inputs. |
| outputs | \`Model response\` | Outputs. |

Suggested registration description:

> 0x7o/incoder-api is a hosted Hugging Face Space that exposes an Incoder-style programming assistant through a public web endpoint. It is relevant to OAN users who are searching for lightweight agent services that can support code understanding, prompt-driven code generation, or quick experimentation with a hosted model interface. The resource is registered as an agent service rather than as a local package because the primary access path is the public Space URL and its Gradio-compatible interaction surface. Its registration metadata should help Discovery users understand the expected inputs, such as programming prompts or form parameters, and the expected outputs, such as generated text or model responses. The description also records the upstream source and version-like revision so future registrations can update the same resource when the Space changes.
`;
const huggingFaceIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-hf-test-"));
try {
  const draft = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: huggingFaceMarkdown,
    identityDir: huggingFaceIdentityDir,
  });
  assert(draft.ok, "HuggingFace markdown should produce a complete draft");
  assert(draft.data?.candidate.resourceType === "agent_service", "HuggingFace type parse mismatch");
  assert(draft.data?.candidate.protocol === "huggingface-space/gradio", "HuggingFace protocol parse mismatch");
  assert(draft.data?.submission?.resourceDid.startsWith("did:oan:AG"), "agent_service draft should use AG DID subject code");
  const candidateDescriptionWordCount = descriptionUnitCount(draft.data?.candidate.description);
  const submissionDescriptionWordCount = descriptionUnitCount(
    draft.data?.submission?.didDocument.oanMetadata?.resourceDescription?.description,
  );
  assert(
    candidateDescriptionWordCount >= 200 && candidateDescriptionWordCount <= 400,
    "short HuggingFace description should be expanded to 200-400 words",
  );
  assert(
    submissionDescriptionWordCount >= 200 && submissionDescriptionWordCount <= 400,
    "draft submission should use the expanded 200-400 word description",
  );
  assert(
    !(draft.data?.qualityIssues ?? []).includes("description_too_short_for_registration"),
    "expanded HuggingFace description should not keep the short-description quality issue",
  );
  assert(
    !/\bOAN\b|\bDID\b|\bDiscovery\b|registered as|upstream discovery source/i.test(
      draft.data?.candidate.description ?? "",
    ),
    "expanded HuggingFace description should stay focused on the resource itself",
  );
} finally {
  await rm(huggingFaceIdentityDir, { recursive: true, force: true });
}

const surveyReportMarkdown = `# 纳米AI

纳米AI 是从《联网智能体数量摸底情况报告》附表中整理出的公开候选智能体服务。

## Suggested OAN Registration Metadata

| Field | Suggested value | Notes |
| --- | --- | --- |
| resourceType | \`agent_service\` | OAN resource category inferred from the source. |
| name | \`纳米AI\` | Human-readable resource name. |
| version | \`1.0.0\` | Observed upstream version. |
| endpoint | \`https://sj.qq.com/appdetail/com.qihoo.namiso\` | Homepage. |
| protocol | \`android-app-store\` | Access model. |
| authorizedDomains | \`knowledge.search\` | Registrar domain. |
| capabilityTags | \`agent-service; app; ppt; mcp\` | Discovery tags. |
| useCases | \`生成视频、报告和PPT; 使用多智能体能力处理检索与内容创作任务\` | Use cases. |
| inputs | \`用户提示词; 内容创作需求; 可选素材\` | Inputs. |
| outputs | \`生成的视频、报告或PPT; 搜索与创作结果\` | Outputs. |
| maintainer | \`天津三六零快看科技有限公司\` | Maintainer. |

Suggested registration description:

> 纳米AI 是一项面向搜索、问答和内容创作场景的智能体服务。
`;
const surveyReportIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-survey-test-"));
try {
  const draft = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: surveyReportMarkdown,
    identityDir: surveyReportIdentityDir,
  });
  assert(draft.ok, "survey markdown should produce a complete draft");
  assert(
    !/联网智能体数量摸底情况报告|\bOAN\b|\bDID\b|\bDiscovery\b|注册审查|registered as|upstream discovery source/i.test(
      draft.data?.candidate.description ?? "",
    ),
    "survey description expansion should not inject registration or report context",
  );
  assert(
    !/联网智能体数量摸底情况报告|\bOAN\b|\bDID\b|\bDiscovery\b|注册审查|registered as|upstream discovery source/i.test(
      String(draft.data?.submission?.didDocument.oanMetadata?.resourceDescription?.capabilityDescription ?? ""),
    ),
    "survey capability description should stay focused on the resource itself",
  );
  assert(
    !draft.data?.qualityIssues?.includes("description_too_short_for_registration"),
    "survey description should be expanded to the required length",
  );
} finally {
  await rm(surveyReportIdentityDir, { recursive: true, force: true });
}

const npmMcpMarkdown = `# @transcend-io/mcp

Transcend MCP Server - unified server with all domain tools.

## Suggested OAN Registration Metadata

| Field | Suggested value | Notes |
| --- | --- | --- |
| resourceType | \`mcp_server\` | OAN resource category inferred from the source. |
| name | \`@transcend-io/mcp\` | Human-readable resource name. |
| version | \`0.6.11\` | Observed upstream version. |
| endpoint | \`stdio://npm/@transcend-io/mcp\` | Logical launch endpoint. |
| protocol | \`mcp/stdio\` | Protocol or access model. |
| schemaUrl | \`https://www.npmjs.com/package/@transcend-io/mcp\` | Descriptor URL. |
| downloadUrl | \`https://www.npmjs.com/package/@transcend-io/mcp\` | Package page. |
| repositoryUrl | \`https://github.com/transcend-io/tools\` | Source repository. |
| packageUrl | \`https://www.npmjs.com/package/@transcend-io/mcp\` | Package registry page. |
| authorizedDomains | \`technology.software_engineering\` | Registrar domain. |
| capabilityTags | \`mcp-server; transcend-io; mcp; unified; domain; tools\` | Discovery tags. |
| useCases | \`Connect an agent runtime to @transcend-io/mcp; Test resource discovery and integration metadata\` | Use cases. |
| inputs | \`MCP tool call arguments; User task context\` | Inputs. |
| outputs | \`MCP tool result; Structured or text response\` | Outputs. |
| license | \`Apache-2.0\` | License. |
| maintainer | \`cami-transcend, michaelfarrell76\` | Maintainer. |

Suggested registration description:

> Transcend MCP Server - unified server with all domain tools.

## How To Use After Discovery

1. Inspect the OAN candidate and copy the resource DID.
2. Open the DID Document or ResourcePackage details.
3. Confirm that the resource type, endpoint, and protocol match the intended use.
4. Review the upstream repository, package page, or catalog page.
5. Check license, runtime permissions, credentials, and data handling requirements.
6. Install, call, or adapt the resource only after reviewing upstream usage instructions.

Expected user outcome: the user can understand what the resource does, where the original material is hosted, how it is normally accessed, and what information should be checked before use.

## Observed Source Metadata Snapshot

\`\`\`json
{
  "downloads": {
    "monthly": 222738,
    "weekly": 11796
  },
  "package": {
    "name": "@transcend-io/mcp",
    "description": "Transcend MCP Server - unified server with all domain tools.",
    "publisher": {
      "email": "npm-oidc-no-reply@github.com"
    }
  }
}
\`\`\`
`;
const npmMcpIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-npm-mcp-test-"));
try {
  const draft = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: npmMcpMarkdown,
    identityDir: npmMcpIdentityDir,
  });
  assert(draft.ok, "npm MCP markdown should produce a complete draft");
  const description = draft.data?.candidate.description ?? "";
  assert(
    descriptionUnitCount(description) >= 200 && descriptionUnitCount(description) <= 400,
    "npm MCP description should be 200-400 words",
  );
  assert(!description.includes('"downloads"'), "npm MCP description should not include JSON snapshot fields");
  assert(!description.includes('"publisher"'), "npm MCP description should not include JSON snapshot objects");
} finally {
  await rm(npmMcpIdentityDir, { recursive: true, force: true });
}

const versionedMcpIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-versioned-mcp-test-"));
try {
  const firstVersion = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: npmMcpMarkdown,
    identityDir: versionedMcpIdentityDir,
    reuseAgentIdentity: true,
  });
  const secondVersion = await descriptionSkill.draftRegistrationFromResourceDescription({
    markdown: npmMcpMarkdown.replaceAll("0.6.11", "0.6.12"),
    identityDir: versionedMcpIdentityDir,
    reuseAgentIdentity: true,
  });
  assert(firstVersion.ok && secondVersion.ok, "versioned MCP drafts should pass");
  assert(
    firstVersion.data?.submission?.resourceDid === secondVersion.data?.submission?.resourceDid,
    "versioned MCP drafts should reuse one resource DID",
  );
  assert(firstVersion.data?.submission?.packageVersion === "0.6.11", "first MCP packageVersion mismatch");
  assert(secondVersion.data?.submission?.packageVersion === "0.6.12", "second MCP packageVersion mismatch");
} finally {
  await rm(versionedMcpIdentityDir, { recursive: true, force: true });
}

const freeTextDraft = await descriptionSkill.draftRegistrationFromResourceDescription({
  text: "Weather assistant API: answers weather questions from a public HTTPS endpoint.",
  overrides: {
    resourceType: "tool_api",
    authorizedDomains: ["technology.software_engineering"],
    capabilityTags: ["weather", "api"],
  },
});
assert(!freeTextDraft.ok, "free text without public URL should not produce a final draft");
assert(
  freeTextDraft.missingInputs?.includes("publicAccessUrl"),
  "free text draft should report missing public access URL",
);

assert(
  descriptionUnitCount(freeTextDraft.data?.candidate.description) >= 200 &&
    descriptionUnitCount(freeTextDraft.data?.candidate.description) <= 400,
  "short free text description should be expanded before reporting quality issues",
);
assert(
  !freeTextDraft.data?.qualityIssues?.includes("description_too_short_for_registration"),
  "expanded free text description should not be reported as too short",
);

const chineseDescription =
  "中文合同审查技能用于帮助智能体工作流处理采购合同、服务协议和合作协议中的常见风险点。它可以根据用户提供的合同文本、审查要求和关注条款，整理付款、交付、违约责任、保密义务、争议解决、自动续约和终止条件等内容，并输出便于人工复核的结构化摘要。该资源适合在企业法务、采购协同和项目管理场景中作为辅助检查工具使用，不能替代律师意见。注册信息会保留公开访问地址、接口协议、输入输出说明和典型使用场景，便于发现节点根据中文任务描述召回资源，也便于用户在查看 DID 文档后判断是否值得进一步访问。";
const chineseDraft = await descriptionSkill.draftRegistrationFromResourceDescription({
  text: chineseDescription,
  overrides: {
    resourceType: "skill",
    name: "中文合同审查技能",
    endpoint: "https://example.org/skills/chinese-contract-review.json",
    authorizedDomains: ["legal.contract_law"],
    capabilityTags: ["legal.contract.review", "合同审查"],
    useCases: ["审查采购合同风险", "整理合同条款摘要"],
    inputs: ["合同文本", "审查规则"],
    outputs: ["风险摘要", "条款建议"],
  },
});
assert(chineseDraft.ok, "Chinese natural-language resource description should produce a complete draft");
assert(
  !chineseDraft.data?.qualityIssues?.includes("description_too_short_for_registration"),
  "200-400 Chinese characters should not be treated as a short English description",
);
assert(
  chineseDraft.data?.qualityIssues?.includes("capability_tags_contain_chinese_terms"),
  "Chinese capability tags should be allowed but reported for review",
);

const invalidChineseDomainDraft = await descriptionSkill.draftRegistrationFromResourceDescription({
  text: chineseDescription,
  overrides: {
    resourceType: "skill",
    name: "中文合同审查技能",
    endpoint: "https://example.org/skills/chinese-contract-review.json",
    authorizedDomains: ["法律"],
    capabilityTags: ["legal.contract.review"],
  },
});
assert(invalidChineseDomainDraft.ok, "draft generation can expose invalid domains to final validation");
const invalidChineseDomainRegistration = await descriptionSkill.registerFromResourceDescription({
  text: chineseDescription,
  overrides: {
    resourceType: "skill",
    name: "中文合同审查技能",
    endpoint: "https://example.org/skills/chinese-contract-review.json",
    authorizedDomains: ["法律"],
    capabilityTags: ["legal.contract.review"],
  },
});
assert(!invalidChineseDomainRegistration.ok, "Chinese authorizedDomains should fail registration validation");
assert(
  invalidChineseDomainRegistration.errorMessage === "invalid_authorized_domains",
  "Chinese authorizedDomains should report invalid_authorized_domains",
);

const filingIdentifierDraft = await descriptionSkill.draftRegistrationFromResourceDescription({
  markdown: `# 文心一言

文心一言 是一项面向用户任务处理的智能体服务。公开材料显示，该服务由北京百度网讯科技有限公司运营，备案或登记编号为 Beijing-WenXinYiYan-20230821。材料未提供可直接打开的服务页面，因此该资源以备案登记标识作为公共登记引用。

## Suggested Registration Metadata

| Field | Suggested value | Notes |
| --- | --- | --- |
| resourceType | \`agent_service\` | Resource category inferred from the service material. |
| name | \`文心一言\` | Human-readable service name. |
| version | \`1.0.0\` | Default version. |
| endpoint | \`filing://internet-agent-survey-report/Beijing-WenXinYiYan-20230821\` | Public filing identifier. |
| protocol | \`public-catalog\` | Access model. |
| authorizedDomains | \`technology.software_engineering\` | Suggested domain. |
| capabilityTags | \`agent-service\` | Capability tags. |
| useCases | \`根据用户输入获取文心一言的生成、检索或执行结果\` | Typical use cases. |
| inputs | \`用户任务描述; 可选上下文和约束条件\` | Inputs. |
| outputs | \`智能体服务响应; 生成、检索、分析或任务执行结果\` | Outputs. |
`,
});
assert(filingIdentifierDraft.ok, "filing identifier URI should satisfy public access metadata");
assert(
  filingIdentifierDraft.data?.candidate.endpoint ===
    "filing://internet-agent-survey-report/Beijing-WenXinYiYan-20230821",
  "filing identifier URI should be preserved as the endpoint",
);

const batchIdentityDir = await mkdtemp(join(tmpdir(), "oan-community-batch-test-"));
try {
  const batch = await descriptionSkill.registerBatchFromResourceDescriptions({
    identityDir: batchIdentityDir,
    items: [
      {
        id: "openclaw-valid",
        markdown: openClawMarkdown,
      },
      {
        id: "missing-url",
        text: "Repository audit assistant: reviews source code activity and summarizes repository risk.",
        overrides: {
          resourceType: "tool_api",
          authorizedDomains: ["technology.software_engineering"],
          capabilityTags: ["developer-tooling", "security"],
        },
      },
      {
        id: "missing-domain",
        markdown: openClawMarkdown,
        overrides: {
          authorizedDomains: [],
        },
      },
    ],
  });
  assert(batch.ok, "batch registration should continue after skipped items");
  assert(batch.data?.summary.total === 3, "batch total mismatch");
  assert(batch.data?.summary.registered === 1, "batch registered count mismatch");
  assert(batch.data?.summary.skipped === 2, "batch skipped count mismatch");
  assert(
    batch.data?.results[1]?.missingInputs?.includes("publicAccessUrl"),
    "batch should record missing public URL for skipped item",
  );
  assert(
    batch.data?.results[2]?.missingInputs?.includes("authorizedDomains"),
    "batch should record missing authorized domains for skipped item",
  );
} finally {
  await rm(batchIdentityDir, { recursive: true, force: true });
}

console.log("oan-community-skill tests passed");
