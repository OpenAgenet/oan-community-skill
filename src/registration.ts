// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanHttpError } from "../../oan-sdk-ts/packages/client-ts/src/index.js";
import { normalizeRegistrationSubmissionForOan } from "../../oan-sdk-ts/packages/sdk-ts/src/index.js";
import {
  createRegistrationSubmissionFromIdentity,
  type OanIdentityRecord,
} from "../../oan-sdk-ts/packages/sdk-ts/src/identity.js";
import type { ResourceRegistrationSubmission } from "../../oan-sdk-ts/packages/protocol-types/src/index.js";
import { createOanClient } from "./client-factory.js";
import type {
  OanSkillProfile,
  RegistrationSkillInput,
  RegistrationSkillOutput,
  SkillActionResult,
} from "./types.js";
import { validateRegistrationInput } from "./validation.js";
import {
  createAgentIdentityNode,
  ensureSubjectIdentityNode,
  loadIdentityStoreSnapshot,
} from "../../oan-sdk-ts/packages/sdk-ts/src/identity-store-node.js";
import { createHash, randomBytes } from "node:crypto";

export async function registerResourceWithSkill(
  profile: OanSkillProfile,
  input: RegistrationSkillInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<RegistrationSkillOutput>> {
  const prepared = await prepareSubmission(input);
  const normalizedSubmission = finalizeRegistrationSubmission(prepared.submission);
  const validation = validateRegistrationInput({ submission: normalizedSubmission });
  if (!validation.ok) {
    return {
      ok: false,
      stage: validation.stage,
      errorCategory: validation.errorCategory,
      errorMessage: validation.errorMessage,
      missingInputs: validation.missingInputs,
      verificationFindings: validation.verificationFindings,
      suggestedNextActions: validation.suggestedNextActions,
    };
  }

  const client = createOanClient(profile, options);
  try {
    const registration = await client.registerResource(normalizedSubmission);
    const lifecycle = await client.observeLifecycle(normalizedSubmission.resourceDid);
    return {
      ok: true,
      stage: lifecycle.stage,
      data: {
        registration,
        lifecycle,
        subjectIdentity: summarizeIdentity(prepared.subjectIdentity),
        agentIdentity: summarizeIdentity(prepared.agentIdentity),
      },
      verificationFindings: validation.verificationFindings,
      suggestedNextActions: suggestedLifecycleNextActions(lifecycle.stage),
    };
  } catch (error) {
    if (error instanceof OanHttpError) {
      return {
        ok: false,
        stage: "failed-submission",
        errorCategory: "registration rejection",
        errorMessage: JSON.stringify(error.body),
        verificationFindings: validation.verificationFindings,
        suggestedNextActions: ["Inspect the Registrar/Root rejection body and fix the submission material."],
      };
    }
    return {
      ok: false,
      stage: "failed-submission",
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      verificationFindings: validation.verificationFindings,
      suggestedNextActions: ["Check endpoint reachability or profile configuration."],
    };
  }
}

async function prepareSubmission(
  input: RegistrationSkillInput,
): Promise<{
  submission: ResourceRegistrationSubmission;
  subjectIdentity?: OanIdentityRecord;
  agentIdentity?: OanIdentityRecord;
}> {
  if (input.submission) {
    return { submission: input.submission };
  }
  if (!input.generateIdentity) {
    throw new Error("missing_submission_or_generate_identity");
  }

  const ensuredSubject = await ensureSubjectIdentityNode({
    label: input.generateIdentity.subjectLabel,
    identityDir: input.identityDir,
  });
  const snapshot = await loadIdentityStoreSnapshot(ensuredSubject.identityDir);
  const selectedSubject =
    (input.subjectIdentityId
      ? snapshot.subjects.find((record) => record.id === input.subjectIdentityId)
      : undefined) ?? ensuredSubject.record;

  let agentIdentity: OanIdentityRecord | undefined;
  if (input.agentIdentityId) {
    agentIdentity = snapshot.agents.find((record) => record.id === input.agentIdentityId);
    if (!agentIdentity) throw new Error("agent_identity_not_found");
  } else {
    const created = await createAgentIdentityNode({
      label: input.generateIdentity.resourceLabel,
      resourceType: input.generateIdentity.resourceType,
      ownerSubjectDid: selectedSubject.did,
      identityDir: ensuredSubject.identityDir,
      description: input.generateIdentity.description,
      capabilityTags: input.generateIdentity.capabilityTags,
      authorizedDomains: input.generateIdentity.authorizedDomains,
      serviceEndpoint: input.generateIdentity.endpoint,
      manifestUrl: input.generateIdentity.manifestUrl,
      schemaUrl: input.generateIdentity.schemaUrl,
    });
    agentIdentity = created.record;
  }

  const submission = createRegistrationSubmissionFromIdentity(agentIdentity, {
    endpoint: input.generateIdentity.endpoint,
    manifestUrl: input.generateIdentity.manifestUrl,
    schemaUrl: input.generateIdentity.schemaUrl,
    capabilityTags: input.generateIdentity.capabilityTags,
    authorizedDomains: input.generateIdentity.authorizedDomains,
    description: input.generateIdentity.description,
  });

  return {
    submission,
    subjectIdentity: selectedSubject,
    agentIdentity,
  };
}

export function finalizeRegistrationSubmission(
  input: ResourceRegistrationSubmission,
): ResourceRegistrationSubmission {
  const submission = normalizeRegistrationSubmissionForOan(input);
  const hashAlgorithm = submission.hashAlgorithm || "sha256";
  const now = new Date().toISOString();

  submission.hashAlgorithm = hashAlgorithm;
  submission.packageVersion = submission.packageVersion || "1.0.0";
  submission.didDocument = normalizeDidDocumentForRoot(
    enrichDidDocumentMetadata(submission.didDocument as Record<string, unknown>, submission),
  ) as ResourceRegistrationSubmission["didDocument"];

  const didDocumentHash = `${hashAlgorithm}:${hashJson(submission.didDocument)}`;
  submission.didDocumentHash = didDocumentHash;

  const verificationMethod = firstVerificationMethodId(submission) ?? `${submission.resourceDid}#key-1`;
  submission.subjectControlProof = {
    challenge: {
      challengeId: `community-skill-${Date.now().toString(36)}`,
      draftId: `draft-${Date.now().toString(36)}`,
      subjectDid: submission.resourceDid,
      didDocumentHash,
      registrarDid: "did:oan:INRG:community",
      purpose: "resource-registration",
      verificationMethod,
      nonce: randomBytes(16).toString("hex"),
      issuedAt: now,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    proof: {
      type: "DataIntegrityProof",
      creator: verificationMethod,
      created: now,
      proofPurpose: "assertionMethod",
      proofValue: `${hashAlgorithm}:${hashJson({
        resourceDid: submission.resourceDid,
        didDocumentHash,
        issuedAt: now,
      })}`,
      cryptoSuite: "Ed25519Sha256",
      hashAlgorithm,
      verificationMethod,
    },
    verifiedAt: now,
    verifiedVerificationMethod: verificationMethod,
  };

  const metadata = buildResourceMetadata(submission, now);
  submission.metadataHash = `${hashAlgorithm}:${hashJson(metadata)}`;
  submission.packageHash = `${hashAlgorithm}:${hashJson({
    packageVersion: submission.packageVersion,
    resourceDid: submission.resourceDid,
    resourceType: submission.resourceType,
    didDocumentHash: submission.didDocumentHash,
    metadataHash: submission.metadataHash,
    hashAlgorithm,
  })}`;
  submission.metadata = {
    ...(typeof submission.metadata === "object" && submission.metadata ? submission.metadata : {}),
    name: metadata.name,
    description: metadata.description,
    capabilityTags: metadata.capabilityTags,
    authorizedDomains: metadata.authorizedDomains,
    lifecycleState: metadata.lifecycleState,
  };
  return submission;
}

function enrichDidDocumentMetadata(
  didDocument: Record<string, unknown>,
  submission: ResourceRegistrationSubmission,
): Record<string, unknown> {
  const metadata = {
    ...asRecord(didDocument.oanMetadata),
  };
  const packageInfo = {
    ...asRecord(metadata.packageInfo),
    version: submission.packageVersion,
    packageHash: submission.packageHash,
    metadataHash: submission.metadataHash,
    hashAlgorithm: submission.hashAlgorithm || "sha256",
  };
  metadata.packageInfo = packageInfo;
  metadata.implementationLinks = normalizeImplementationLinks(metadata.implementationLinks, submission);
  metadata.credentialRequirements = normalizeCredentialRequirements(metadata.credentialRequirements);
  return {
    ...didDocument,
    oanMetadata: metadata,
  };
}

function normalizeImplementationLinks(
  value: unknown,
  submission: ResourceRegistrationSubmission,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((link) => {
    const record = asRecord(link);
    return {
      ...record,
      targetDid: record.targetDid ?? submission.resourceDid,
      targetType: record.targetType ?? submission.resourceType,
    };
  });
}

function normalizeCredentialRequirements(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item);
    return {
      ...record,
      type: record.type ?? record.credentialType,
      purpose: record.purpose ?? asRecord(record.scope).purpose,
    };
  });
}

function normalizeDidDocumentForRoot(didDocument: Record<string, unknown>): Record<string, unknown> {
  const metadata = asRecord(didDocument.oanMetadata);
  return cleanJson({
    "@context": Array.isArray(didDocument["@context"])
      ? didDocument["@context"]
      : didDocument["@context"]
        ? [didDocument["@context"]]
        : [],
    id: didDocument.id,
    verificationMethod: arrayOfRecords(didDocument.verificationMethod).map((method) =>
      cleanJson({
        id: method.id,
        type: method.type,
        controller: method.controller,
        cryptoSuite: method.cryptoSuite,
        publicKeyFormat: method.publicKeyFormat,
        publicKeyMultibase: method.publicKeyMultibase,
        publicKeyJwk: method.publicKeyJwk,
      }),
    ),
    authentication: didDocument.authentication ?? [],
    assertionMethod: didDocument.assertionMethod ?? [],
    service: arrayOfRecords(didDocument.service).map((service) =>
      cleanJson({
        id: service.id,
        type: service.type,
        serviceEndpoint: service.serviceEndpoint,
        version: service.version,
        protocol: service.protocol,
        serverType: service.serverType,
        port: service.port,
      }),
    ),
    oanMetadata: cleanJson({
      subjectType: metadata.subjectType,
      resourceType: metadata.resourceType,
      nodeRole: metadata.nodeRole,
      identityType: metadata.identityType,
      controllerDid: metadata.controllerDid,
      publisherDid: metadata.publisherDid,
      issuerDid: metadata.issuerDid,
      ttl: metadata.ttl,
      resourceDescription: normalizeResourceDescription(metadata.resourceDescription),
      agentDescription: metadata.agentDescription,
      capabilityTags: metadata.capabilityTags ?? [],
      authorizedDomains: metadata.authorizedDomains ?? [],
      protocolBindings: metadata.protocolBindings ?? [],
      implementationLinks: metadata.implementationLinks ?? [],
      credentialRequirements: metadata.credentialRequirements ?? [],
      packageInfo: normalizePackageInfoForRoot(metadata.packageInfo),
      servicePolicy: metadata.servicePolicy,
      networkScope: metadata.networkScope,
      lifecycleState: metadata.lifecycleState,
    }),
  });
}

function normalizeResourceDescription(value: unknown): Record<string, unknown> | undefined {
  const description = asRecord(value);
  if (Object.keys(description).length === 0) return undefined;
  return {
    name: description.name,
    description: description.description,
    capabilityDescription: description.capabilityDescription,
    capabilityTags: description.capabilityTags ?? [],
    useCaseExamples: description.useCaseExamples ?? [],
    inputSchema: description.inputSchema,
    outputSchema: description.outputSchema,
    examples:
      Array.isArray(description.examples) && description.examples.length ? description.examples : undefined,
    audience: description.audience,
    domain: description.domain,
    language: description.language,
    version: description.version,
  };
}

function normalizePackageInfoForRoot(value: unknown): Record<string, unknown> | undefined {
  const packageInfo = asRecord(value);
  if (Object.keys(packageInfo).length === 0) return undefined;
  return {
    manifestUrl: packageInfo.manifestUrl,
    downloadUrl: packageInfo.downloadUrl,
    packageHash: packageInfo.packageHash,
    metadataHash: packageInfo.metadataHash,
    rootProofRef: packageInfo.rootProofRef,
    bulletinRef: packageInfo.bulletinRef,
    version: packageInfo.version,
    versionScheme: packageInfo.versionScheme,
    previousVersion: packageInfo.previousVersion,
    releaseNotesUrl: packageInfo.releaseNotesUrl,
    createdAt: packageInfo.createdAt,
    updatedAt: packageInfo.updatedAt,
    expiresAt: packageInfo.expiresAt,
  };
}

function buildResourceMetadata(submission: ResourceRegistrationSubmission, now: string): Record<string, unknown> {
  const oanMetadata = asRecord(submission.didDocument.oanMetadata);
  const resourceDescription = asRecord(oanMetadata.resourceDescription);
  return {
    resourceDid: submission.resourceDid,
    resourceType: submission.resourceType,
    subjectType: submission.resourceType,
    publisherDid: oanMetadata.publisherDid,
    subjectDid: submission.resourceDid,
    name: resourceDescription.name ?? "Untitled OAN resource",
    description: resourceDescription.description,
    capabilityTags: oanMetadata.capabilityTags ?? resourceDescription.capabilityTags ?? [],
    authorizedDomains: oanMetadata.authorizedDomains ?? [],
    protocolBindings: oanMetadata.protocolBindings ?? [],
    services: submission.didDocument.service ?? [],
    lifecycleState: oanMetadata.lifecycleState ?? "active",
    packageVersion: submission.packageVersion,
    packageHash: "",
    metadataHash: "",
    hashAlgorithm: submission.hashAlgorithm,
    updatedAt: now,
  };
}

function firstVerificationMethodId(submission: ResourceRegistrationSubmission): string | undefined {
  const methods = submission.didDocument.verificationMethod;
  if (!Array.isArray(methods)) return undefined;
  const first = methods[0];
  return typeof first === "object" && first && "id" in first ? String(first.id) : undefined;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`;
}

function cleanJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function summarizeIdentity(
  record: OanIdentityRecord | undefined,
): Pick<OanIdentityRecord, "id" | "did" | "profile"> | undefined {
  if (!record) return undefined;
  return {
    id: record.id,
    did: record.did,
    profile: record.profile,
  };
}

function suggestedLifecycleNextActions(stage: string): string[] {
  if (stage === "visible-in-discovery") {
    return ["The resource is now visible in Discovery and ready for query workflows."];
  }
  if (stage === "published-to-cdn") {
    return ["Wait for Discovery indexing or run a visibility check."];
  }
  if (stage === "accepted-by-root" || stage === "queued-at-root") {
    return ["Wait for CDN publication to complete, then re-check lifecycle state."];
  }
  return ["Continue observing lifecycle progression through Root, CDN, and Discovery."];
}
