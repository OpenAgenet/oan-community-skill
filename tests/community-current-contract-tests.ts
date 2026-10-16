import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OanSkill,
  createDefaultProfile,
  selectRegistrarEndpoint,
  selectDiscoveryEndpoint,
  listLocalIdentities,
} from "../src/index.js";
import { loadIdentityStoreSnapshot } from "@openagenet/oan-sdk-ts/identity-store-node";
import {
  hashDidDocumentWithProof,
  hashRegistrationPackageBinding,
} from "@openagenet/oan-sdk-ts";
import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "@openagenet/oan-sdk-ts";
import type { ResourceRegistrationSubmission } from "@openagenet/oan-sdk-ts/protocol-types";
import {
  parseDidOanDocument,
  verifyDidOanDataIntegrity,
} from "@openagenet/oan-sdk-ts/protocol-types";
import { documentLoader as securityLoader } from "ed25519-signature-2020-context";
import { createSkillFetch } from "../src/client-factory.js";
import { OanHttpError } from "@openagenet/oan-sdk-ts/client";
async function verifyDocument(document: any): Promise<void> {
  const documentLoader = async (url: string): Promise<any> => {
    if (url === document.id)
      return { contextUrl: null, documentUrl: url, document };
    if (url === "https://www.w3.org/ns/did/v1")
      return {
        contextUrl: null,
        documentUrl: url,
        document: {
          "@context": {
            id: "@id",
            type: "@type",
            controller: "https://w3id.org/security#controller",
            verificationMethod: "https://w3id.org/security#verificationMethod",
            authentication: "https://w3id.org/security#authenticationMethod",
            assertionMethod: "https://w3id.org/security#assertionMethod",
            capabilityInvocation:
              "https://w3id.org/security#capabilityInvocationMethod",
            service: "https://www.w3.org/ns/did#service",
            serviceEndpoint: "https://www.w3.org/ns/did#serviceEndpoint",
          },
        },
      };
    if (url === "https://openagenet.xyz/did-oan-specs/v1")
      return {
        contextUrl: null,
        documentUrl: url,
        document: {
          "@context": {
            "@vocab": "https://openagenet.xyz/did-oan-specs#",
            oanMetadata: "https://openagenet.xyz/did-oan-specs#oanMetadata",
            externalIdentifiers: {
              "@id": "https://openagenet.xyz/did-oan-specs#externalIdentifiers",
              "@context": {
                id: {
                  "@id":
                    "https://openagenet.xyz/did-oan-specs#externalIdentifierId",
                  "@type": "http://www.w3.org/2001/XMLSchema#string",
                },
                resolutionServiceEndpoint: {
                  "@id":
                    "https://openagenet.xyz/did-oan-specs#resolutionServiceEndpoint",
                  "@type": "http://www.w3.org/2001/XMLSchema#string",
                },
              },
            },
          },
        },
      };
    return securityLoader(url);
  };
  await verifyDidOanDataIntegrity(
    document,
    document.verificationMethod[0].publicKeyJwk,
    { documentLoader },
  );
}
const registrarDid = "did:oan:2Xr85:HmxwAudrBEA87hc6tv9JQx91cNfLqHwv";
const requests: Array<{ url: string; body?: any }> = [];
const posts: ResourceRegistrationSubmission[] = [];
let rejectRegistration = false;
const mock = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, body });
  assert(
    !url.includes("openagenet.xyz"),
    `custom-only leaked to official: ${url}`,
  );
  assert(!JSON.stringify(body ?? {}).includes("privateKeyJwk"));
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  if (url.endsWith("/registrar/status")) return json({ registrarDid });
  if (url.endsWith("/resources/register")) {
    posts.push(body);
    parseDidOanDocument(body.didDocument);
    await verifyDocument(body.didDocument);
    if (body.controllerAuthorizationProof) {
      const doc = body.controllerAuthorizationProof.controllerDidDocument;
      await verifyDocument(doc);
    }
    assert.equal(
      body.didDocumentHash,
      `sha256:${await hashDidDocumentWithProof(body.didDocument)}`,
    );
    assert.equal(
      body.packageHash,
      `sha256:${await hashRegistrationPackageBinding(body)}`,
    );
    assert.equal(
      body.subjectControlProof.challenge.didDocumentHash,
      body.didDocumentHash,
    );
    assert.equal(body.subjectControlProof.challenge.registrarDid, registrarDid);
    const metadata = body.didDocument.oanMetadata;
    const rootMetadata = {
      resourceDid: body.resourceDid,
      resourceType: body.resourceType,
      subjectType: metadata.subjectType,
      publisherDid: metadata.publisherDid,
      subjectDid: body.resourceDid,
      name: body.metadata.name,
      description: body.metadata.description ?? "",
      capabilityTags: body.metadata.capabilityTags ?? [],
      authorizedDomains: metadata.authorizedDomains,
      protocolBindings: metadata.protocolBindings ?? [],
      services: body.didDocument.service ?? [],
      lifecycleState: body.metadata.lifecycleState ?? "active",
      packageVersion: body.packageVersion,
      packageHash: "",
      metadataHash: "",
      hashAlgorithm: body.hashAlgorithm,
      updatedAt: body.subjectControlProof.verifiedAt,
    };
    assert.equal(
      body.metadataHash,
      `sha256:${createHash("sha256").update(canonicalJson(rootMetadata), "utf8").digest("hex")}`,
      "Root metadata hash must match final proof timestamp",
    );
    return rejectRegistration
      ? json({ message: "unauthorized_domains" }, 403)
      : json({ status: "submitted", resourceDid: body.resourceDid });
  }
  if (url.endsWith("/registration-credential")) {
    const alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let value = 0n;
    for (const char of body.proof.proofValue.slice(1))
      value = value * 58n + BigInt(alphabet.indexOf(char));
    let hex = value.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const bytes = Buffer.concat([
      Buffer.alloc(body.proof.proofValue.slice(1).match(/^1*/)[0].length),
      Buffer.from(hex, "hex"),
    ]);
    const method = body.controllerDidDocument.verificationMethod.find(
      (m: any) => m.id === body.challenge.verificationMethod,
    );
    assert(
      verify(
        null,
        Buffer.from(canonicalJson(body.challenge), "utf8"),
        createPublicKey({ key: method.publicKeyJwk, format: "jwk" }),
        bytes,
      ),
    );
    assert.equal(body.challenge.aud, registrarDid);
    assert.equal(body.challenge.path, new URL(url).pathname);
    return json({
      resourceDid: body.challenge.resourceDid,
      registrationCredential: { type: ["VerifiableCredential"] },
    });
  }
  if (url.endsWith("/discovery/resources/query"))
    return json({
      discoveryDid: "test",
      candidates: [],
      createdAt: new Date().toISOString(),
    });
  if (url.endsWith("/discovery/query/explain"))
    return json({ error: "unsupported" }, 404);
  if (url.includes("/discovery/index/resources?"))
    return json({
      items: [],
      count: 0,
      afterCursor: 0,
      nextCursor: 0,
      nextResourceDid: null,
      hasMore: false,
    });
  if (url.includes("/resources?"))
    return json({
      items: [],
      count: 0,
      afterDid: null,
      nextDid: null,
      hasMore: false,
    });
  if (url.endsWith("/visibility")) return json({ visible: [] });
  if (url.endsWith("/status")) return json({ status: "active" });
  if (url.includes("/discovery/index/resources/"))
    return json({
      resourceDid: decodeURIComponent(url.split("/").at(-1)!),
      package: null,
    });
  if (url.includes("/resources/"))
    return json({
      record: { resourceDid: decodeURIComponent(url.split("/").at(-1)!) },
    });
  return json({ error: "not_found" }, 404);
}) as typeof fetch;

assert.equal(
  selectRegistrarEndpoint(createDefaultProfile()),
  "https://www.openagenet.xyz",
);
let requestWrites = 0;
const retryFetch = createSkillFetch(
  createDefaultProfile({ retryPolicy: { maxAttempts: 3, delayMs: 0 } }),
  (async () => {
    requestWrites++;
    throw new Error("network failed");
  }) as typeof fetch,
);
await assert.rejects(
  () =>
    retryFetch(
      new Request("https://r.test/resources/register", {
        method: "POST",
        body: "{}",
      }),
    ),
  /network failed/,
);
assert.equal(
  requestWrites,
  1,
  "Request objects with POST must never be replayed",
);
let htmlCalls = 0;
const htmlFetch = createSkillFetch(
  createDefaultProfile({ retryPolicy: { maxAttempts: 3, delayMs: 0 } }),
  (async () => {
    htmlCalls++;
    return new Response("<html>route not found</html>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch,
);
await assert.rejects(
  () => htmlFetch("https://r.test/missing"),
  (error) =>
    error instanceof OanHttpError &&
    error.status === 404 &&
    JSON.stringify(error.body).includes("route not found"),
);
assert.equal(htmlCalls, 1);
assert.equal(
  selectDiscoveryEndpoint(createDefaultProfile()),
  "https://www.openagenet.xyz",
);
assert.equal(
  selectRegistrarEndpoint(
    createDefaultProfile({ nodeSelectionMode: "custom-only" }),
  ),
  undefined,
);
assert.equal(
  selectRegistrarEndpoint(
    createDefaultProfile({
      nodeSelectionMode: "custom-preferred",
      customRegistrarEndpoints: ["https://r.test/"],
    }),
  ),
  "https://r.test",
);
assert.equal(
  selectRegistrarEndpoint(
    createDefaultProfile({ customRegistrarEndpoints: ["https://r.test"] }),
  ),
  "https://www.openagenet.xyz",
);
const dir = await mkdtemp(join(tmpdir(), "oan-current-contract-"));
try {
  const skill = new OanSkill(
    {
      nodeSelectionMode: "custom-only",
      registrarEndpoint: "https://r.test",
      discoveryEndpoint: "https://d.test",
      retryPolicy: { maxAttempts: 1, delayMs: 0 },
    },
    { fetchImpl: mock },
  );
  const register = async (
    type: "skill" | "controller",
    label: string,
    controllerIdentityId?: string,
  ) =>
    skill.register({
      identityDir: dir,
      controllerIdentityId,
      generateIdentity: {
        resourceLabel: label,
        resourceType: type,
        authorizedDomains: ["technology"],
        endpoint:
          type === "controller" ? undefined : "https://example.org/skill",
        description: "Contract test",
      },
    });
  const controller = await register("controller", "Controller");
  assert(controller.ok, controller.errorMessage ?? "controller failed");
  const controllerId = controller.data!.agentIdentity!.id;
  const saved = (await loadIdentityStoreSnapshot(dir)).subjects.find(
    (r) => r.id === controllerId,
  )!;
  assert(saved.did.startsWith("did:oan:HmxwA:"));
  assert(saved.didDocument.proof);
  const controllerUpdate = await skill.register({
    identityDir: dir,
    agentIdentityId: controllerId,
    generateIdentity: {
      resourceType: "controller",
      resourceLabel: "Controller",
      authorizedDomains: ["technology"],
      packageVersion: "1.0.1",
    },
  });
  assert(
    controllerUpdate.ok,
    controllerUpdate.errorMessage ?? "controller update failed",
  );
  assert.equal(controllerUpdate.data!.agentIdentity!.did, saved.did);
  assert.equal((await loadIdentityStoreSnapshot(dir)).subjects.length, 1);
  // Use the latest signed document after the controller version update.
  saved.didDocument = (await loadIdentityStoreSnapshot(dir)).subjects.find(
    (record) => record.id === controllerId,
  )!.didDocument;
  const external = await register(
    "skill",
    "External controller resource",
    controllerId,
  );
  assert(external.ok, external.errorMessage ?? "external failed");
  assert.deepEqual(
    posts.at(-1)!.controllerAuthorizationProof!.controllerDidDocument,
    saved.didDocument,
  );
  assert(
    (
      await skill.registrationCredential({
        resourceDid: external.data!.registration.resourceDid,
        identityDir: dir,
        controllerIdentityId: controllerId,
      })
    ).ok,
  );
  const self = await register("skill", "Self");
  assert(self.ok, self.errorMessage ?? "self failed");
  assert.equal(posts.at(-1)!.didDocument.controller, posts.at(-1)!.resourceDid);
  const resourceAsController = await register(
    "skill",
    "Child of self resource",
    self.data!.agentIdentity!.id,
  );
  assert(
    resourceAsController.ok,
    resourceAsController.errorMessage ?? "child failed",
  );
  assert.equal(
    posts.at(-1)!.controllerAuthorizationProof!.controllerDidDocument
      .oanMetadata!.resourceType,
    "skill",
  );
  const signed = structuredClone(posts.at(-1)!);
  const replay = await skill.register({ submission: signed, identityDir: dir });
  assert(replay.ok, replay.errorMessage ?? "signed failed");
  assert.deepEqual(posts.at(-1), signed);
  const tampered = structuredClone(signed);
  tampered.didDocumentHash = "sha256:changed";
  const count = posts.length;
  assert(!(await skill.register({ submission: tampered })).ok);
  assert.equal(posts.length, count);
  assert(
    !(
      await skill.register({
        identityDir: dir,
        controllerIdentityId: "missing",
        generateIdentity: { resourceType: "skill", resourceLabel: "Missing" },
      })
    ).ok,
  );
  assert(
    !(
      await skill.register({
        registrarDid: "did:oan:P9aBc:2LmNo3PqRsTuVwXyZaBcDeFgHiJkLmNo",
        generateIdentity: {
          resourceType: "skill",
          resourceLabel: "Wrong node",
        },
      })
    ).ok,
  );
  rejectRegistration = true;
  const rejected = await register("skill", "Rejected");
  assert(!rejected.ok);
  assert(rejected.localIdentity?.did);
  assert.equal(rejected.identityDir, dir);
  assert.equal(posts.length, count + 1);
  rejectRegistration = false;
  const retryRejected = await register("skill", "Rejected");
  assert(retryRejected.ok, retryRejected.errorMessage ?? "retry rejected identity failed");
  assert.equal(retryRejected.localIdentity?.did, rejected.localIdentity.did,
    "retry after Registrar rejection must reuse the same DID");
  const discover = await skill.discover({
    query: { query: "contract", limit: 3 },
  });
  assert(discover.ok);
  assert.equal(discover.stage, undefined);
  assert.equal(discover.data!.explanation, undefined);
  assert(!(await skill.discover({ query: { limit: 0 } })).ok);
  const invalidStart = requests.length;
  for (const query of [
    { query: 42 },
    { capabilityTags: "software" },
    { searchMode: "semantic" },
    { versionMode: "exact" },
    { limit: "5" },
    { resourceType: "wrong" },
  ]) {
    assert(!(await skill.discover({ query: query as any })).ok);
  }
  assert.equal(
    requests.length,
    invalidStart,
    "invalid JSON must fail before network access",
  );
  assert(
    !(await skill.listResources({ source: "registrar", afterDid: 42 } as any))
      .ok,
  );
  assert(
    !(
      await skill.draftRegistrationFromResourceDescription({
        overrides: { authorizedDomains: "technology" },
      } as any)
    ).ok,
  );
  assert.throws(() =>
    createDefaultProfile({ customRegistrarEndpoints: "https://r.test" } as any),
  );
  assert.throws(() =>
    createDefaultProfile({ allowDirectRootInspection: "false" } as any),
  );
  assert(
    (await skill.queryResource({ resourceDid: saved.did, source: "registrar" }))
      .ok,
  );
  assert((await skill.queryResource({ resourceDid: saved.did })).ok);
  assert((await skill.listResources({ source: "registrar", limit: 2 })).ok);
  assert((await skill.listResources({ source: "discovery", limit: 2 })).ok);
  assert(!(await skill.listResources({ source: "discovery", limit: 1000 })).ok);
  assert((await skill.registrationCredentialStatus(saved.did)).ok);
  const missing = new OanSkill(
    { nodeSelectionMode: "custom-only" },
    { fetchImpl: mock },
  );
  const before = requests.length;
  assert(!(await missing.discover({ query: {} })).ok);
  assert.equal(requests.length, before);
  const description = {
    text: "A useful Chinese and English software documentation service.",
    identityDir: dir,
    overrides: {
      resourceType: "skill" as const,
      name: "Description resource",
      endpoint: "https://example.org/tool",
      authorizedDomains: ["technology"],
    },
  };
  const drafted =
    await skill.draftRegistrationFromResourceDescription(description);
  assert(drafted.ok, drafted.errorMessage ?? "draft failed");
  const retryDraft = await skill.draftRegistrationFromResourceDescription(description);
  assert(retryDraft.ok, retryDraft.errorMessage ?? "retry draft failed");
  assert.equal(retryDraft.data!.submission!.resourceDid, drafted.data!.submission!.resourceDid,
    "default draft retry must reuse the pending resource DID");
  assert(
    !(
      await skill.draftRegistrationFromResourceDescription({
        ...description,
        overrides: {
          ...description.overrides,
          authorizedDomains: ["*", "technology"],
        },
      })
    ).ok,
  );
  assert(drafted.data!.agentIdentity?.id);
  assert.equal(drafted.data!.identityDir, dir);
  assert.equal(
    drafted.data!.submission!.didDocument.oanMetadata!.packageInfo!.packageHash,
    undefined,
    "do not invent an artifact hash from a description",
  );
  const stored = await loadIdentityStoreSnapshot(dir);
  const beforeAgents = stored.agents.length;
  assert(
    (
      await skill.register({
        submission: drafted.data!.submission!,
        identityDir: dir,
      })
    ).ok,
  );
  assert.equal(
    (await loadIdentityStoreSnapshot(dir)).agents.length,
    beforeAgents,
  );
  assert.equal(
    (await (await import("../src/registration-state.js")).loadIdentityStoreSnapshot(dir)).agents.find(record => record.did === drafted.data!.submission!.resourceDid)?.profile.metadata?.registrationState,
    "registered", "accepted signed drafts must mark their stored identity registered",
  );
  assert(
    (
      await skill.registerFromResourceDescription({
        ...description,
        reuseAgentIdentity: true,
      })
    ).ok,
  );
  const batch = await skill.registerBatchFromResourceDescriptions({
    identityDir: dir,
    items: [
      { text: "bad", overrides: { resourceType: "invalid" as any } },
      { ...description },
    ],
  });
  assert.equal(batch.data!.results.length, 2);
  assert.equal(batch.data!.summary.registered, 1);
  assert(!batch.ok);
  assert(batch.data!.results[1].registration);
  assert(batch.data!.results[1].agentIdentity?.id);
  const controlledDescription = await skill.registerFromResourceDescription({
    ...description,
    controllerIdentityId: controllerId,
  });
  assert(
    controlledDescription.ok,
    controlledDescription.errorMessage ?? "description controller failed",
  );
  assert.equal(posts.at(-1)!.didDocument.oanMetadata!.controllerDid, saved.did);
  const updateControlled = await skill.registerFromResourceDescription({
    ...description,
    agentIdentityId: controlledDescription.data!.agentIdentity!.id,
  });
  assert(
    updateControlled.ok,
    updateControlled.errorMessage ?? "controller reuse failed",
  );
  const listed = await listLocalIdentities({ identityDir: dir });
  assert(listed.ok);
  assert(listed.data!.items.some((item) => item.id === controllerId));
  assert(!JSON.stringify(listed).includes("privateKey"));
  assert(!(await missing.lifecycle({ resourceDid: saved.did })).ok);
  assert(!requests.some((r) => /\/root\/|\/cdn\//.test(r.url)));
  console.log("current protocol contracts passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
