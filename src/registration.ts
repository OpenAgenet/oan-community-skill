// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanHttpError } from "@openagenet/oan-sdk-ts/client";
import {
  finalizeRegistrationSubmissionWithProof,
  hashRegistrationPackageBinding,
  hashDidDocumentWithProof,
  normalizeRegistrationSubmissionForOan,
} from "@openagenet/oan-sdk-ts";
import {
  createRegistrationSubmissionFromIdentity,
  createOanIdentityRecord,
  upsertIdentityRecord,
  type OanIdentityRecord,
} from "@openagenet/oan-sdk-ts";
import type { ResourceRegistrationSubmission } from "@openagenet/oan-sdk-ts/protocol-types";
import { createOanClient } from "./client-factory.js";
import type {
  OanSkillProfile,
  RegistrationSkillInput,
  RegistrationSkillOutput,
  SkillActionResult,
} from "./types.js";
import { validateRegistrationInput } from "./validation.js";
import {
  getDefaultIdentityStoreDir,
} from "@openagenet/oan-sdk-ts/identity-store-node";
import { loadIdentityStoreSnapshot, saveIdentityStoreSnapshot } from "./registration-state.js";
import { createHash } from "node:crypto";
import { resolveRegistrarDid } from "./registrar.js";
import { DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS } from "./profiles.js";
import { createRuntimeIdentityHandoff } from "./runtime-handoff.js";
import { saveRegistrationFiles } from "./registration-files.js";
import {
  objectInput,
  stringInput,
  stringsInput,
  accessUrlInput,
} from "./input.js";

/** Trusted host only: freeze the final wire submission before durable journaling/network I/O. */
export async function prepareRegistrationForHost(profile: OanSkillProfile,input: RegistrationSkillInput,options:{fetchImpl?:typeof fetch}={}) {
  const registrarDid=await resolveRegistrarDid(profile,input.registrarDid,options);
  const prepared=await prepareSubmission(input,registrarDid);
  const submission=await finalizeRegistrationSubmissionWithControllerProof(prepared,registrarDid);
  assertSubmissionProofFresh(submission);
  assertPublicMaterial(submission);
  const validation=validateRegistrationInput({submission});
  if(!validation.ok)throw new Error('publication_candidate_invalid');
  const identity=prepared.agentIdentity??prepared.persistedIdentity;
  if(identity){
    const directory=input.identityDir??getDefaultIdentityStoreDir();
    await saveIdentityStoreSnapshot(upsertIdentityRecord(await loadIdentityStoreSnapshot(directory),
      {...identity,didDocument:submission.didDocument}),directory);
  }
  return submission;
}

export async function registerResourceWithSkill(
  profile: OanSkillProfile,
  input: RegistrationSkillInput,
  options: { fetchImpl?: typeof fetch } = {},
  retryState: { automaticVersionRetry?: boolean; attempts?: number } = {},
): Promise<SkillActionResult<RegistrationSkillOutput>> {
  let localIdentity: { id: string; did: string } | undefined;
  try {
    objectInput(input, "input");
    for (const key of [
      "identityDir",
      "controllerIdentityId",
      "subjectIdentityId",
      "agentIdentityId",
      "registrarDid",
    ] as const)
      stringInput(input[key], key);
    if (input.generateIdentity) {
      objectInput(input.generateIdentity, "generateIdentity");
      const generate = input.generateIdentity;
      stringInput(
        generate.resourceLabel,
        "generateIdentity.resourceLabel",
        true,
      );
      if (
        ![
          "controller",
          "agent_service",
          "skill",
          "mcp_server",
          "tool_api",
        ].includes(generate.resourceType)
      )
        throw new Error("unsupported generateIdentity.resourceType");
      for (const key of ["description", "protocol", "packageVersion"] as const)
        stringInput(generate[key], `generateIdentity.${key}`);
      for (const key of ["authorizedDomains", "capabilityTags"] as const)
        stringsInput(generate[key], `generateIdentity.${key}`);
      for (const key of ["endpoint", "manifestUrl", "schemaUrl"] as const)
        accessUrlInput(generate[key], `generateIdentity.${key}`);
      if (!generate.authorizedDomains?.length)
        throw new Error("resource_domains_required");
    }
    const registrarDid = await resolveRegistrarDid(
      profile,
      input.registrarDid,
      options,
    );
    const prepared = await prepareSubmission(input, registrarDid);
    const resourceRecord = prepared.persistedIdentity ?? prepared.agentIdentity;
    if (resourceRecord)
      localIdentity = {
        id: resourceRecord.id,
        did: resourceRecord.did,
      };
    const normalizedSubmission =
      await finalizeRegistrationSubmissionWithControllerProof(
        prepared,
        registrarDid,
      );
    assertSubmissionProofFresh(normalizedSubmission);
    const validation = validateRegistrationInput({
      submission: normalizedSubmission,
    });
    if (!validation.ok) {
      return {
        ok: false,
        stage: validation.stage,
        localIdentity,
        identityDir: input.identityDir ?? getDefaultIdentityStoreDir(),
        errorCategory: validation.errorCategory,
        errorMessage: validation.errorMessage,
        missingInputs: validation.missingInputs,
        verificationFindings: validation.verificationFindings,
        suggestedNextActions: validation.suggestedNextActions,
      };
    }

    assertPublicMaterial(normalizedSubmission);
    const client = createOanClient(profile, options);
    try {
      if (prepared.agentIdentity) {
        const record = {
          ...prepared.agentIdentity,
          didDocument: normalizedSubmission.didDocument,
        };
        const directory = input.identityDir ?? getDefaultIdentityStoreDir();
        await saveIdentityStoreSnapshot(
          upsertIdentityRecord(
            await loadIdentityStoreSnapshot(directory),
            record,
          ),
          directory,
        );
      }
      const registration = await client.registerResource(normalizedSubmission);
      try {
        await markIdentityRegistrationState(
          prepared.persistedIdentity ?? prepared.agentIdentity,
          input.identityDir ?? getDefaultIdentityStoreDir(),
          "registered",
        );
      } catch {
        // The Registrar has already accepted the write. State bookkeeping is
        // best-effort and must not turn a successful registration into a
        // reported submission failure.
      }
      let files: RegistrationSkillOutput["files"];
      let fileSaveError: string | undefined;
      try {
        files = await saveRegistrationFiles(
          input.identityDir ?? getDefaultIdentityStoreDir(),
          normalizedSubmission,
          registration,
        );
      } catch (error) {
        fileSaveError = error instanceof Error ? error.message : String(error);
      }
      const observed = await client.observeLifecycle(
        normalizedSubmission.resourceDid,
      ).catch((error: unknown) => ({
        resourceDid: normalizedSubmission.resourceDid,
        registrarAccepted: true,
        discoveryVisible: false,
        rootObserved: false,
        cdnObserved: false,
        stage: "accepted-by-registrar" as const,
        observations: [
          `Registrar accepted submission; follow-up observation failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      }));
      const lifecycle =
        observed.registrarAccepted ||
        observed.discoveryVisible ||
        observed.rootObserved ||
        observed.cdnObserved
          ? observed
          : {
              ...observed,
              registrarAccepted: true,
              stage: "accepted-by-registrar" as const,
              observations: [
                ...(observed.observations ?? []),
                "Registrar accepted submission; follow-up visibility is not yet confirmed.",
              ],
            };
      return {
        ok: true,
        stage: lifecycle.stage,
        localIdentity,
        identityDir: input.identityDir ?? getDefaultIdentityStoreDir(),
        data: {
          files,
          runtimeHandoff: files ? createRuntimeIdentityHandoff(normalizedSubmission.resourceDid, files, normalizedSubmission.didDocument.oanMetadata?.controllerDid) : undefined,
          fileSaveError,
          registration,
          lifecycle,
          subjectIdentity: summarizeIdentity(prepared.subjectIdentity),
          agentIdentity: summarizeIdentity(resourceRecord),
        },
        verificationFindings: validation.verificationFindings,
        suggestedNextActions: [
          ...suggestedLifecycleNextActions(lifecycle.stage),
          ...(fileSaveError
            ? [
                "Registration succeeded but saving local files failed. Save data.registration immediately and resolve fileSaveError; do not register a second identity.",
              ]
            : [
                "Report the exact saved file paths and explain DID Document, registration VC and OAN Identity uses. Keep VC/receipts and private-key identity files in a secure location.",
              ]),
        ],
      };
    } catch (error) {
      if (error instanceof OanHttpError) {
        const body =
          error.body && typeof error.body === "object"
            ? (error.body as Record<string, unknown>)
            : { message: String(error.body ?? "") };
        const serverCode = typeof body.code === "string"
          ? body.code
          : typeof body.error === "string" ? body.error
            : body.message === "resource_version_conflict" ? body.message : undefined;
        const automaticVersionRetry =
          retryState.automaticVersionRetry ??
          (!input.submission?.packageVersion && !input.generateIdentity?.packageVersion &&
            Boolean(prepared.agentIdentity || input.resourceIdentity || input.generateIdentity));
        const attempts = retryState.attempts ?? 0;
        if (serverCode === "resource_version_conflict" && automaticVersionRetry && attempts < 3) {
          const discoveredVersion = await discoverOfficialPackageVersion(
            normalizedSubmission.resourceDid,
            options.fetchImpl,
          );
          const currentVersion = normalizedSubmission.packageVersion;
          const revisionBase = discoveredVersion &&
            currentVersion.startsWith(`${discoveredVersion}.`)
            ? currentVersion
            : (discoveredVersion ?? currentVersion);
          const nextVersion = incrementResourceRevision(
            revisionBase,
            discoveredVersion ? 0 : attempts,
          );
          const retryInput: RegistrationSkillInput = input.submission
            ? {
                ...input,
                submission: withResourcePackageVersion(input.submission, nextVersion),
              }
            : {
                ...input,
                generateIdentity: {
                  ...input.generateIdentity!,
                  packageVersion: nextVersion,
                },
              };
          return registerResourceWithSkill(profile, retryInput, options, {
            automaticVersionRetry: true,
            attempts: attempts + 1,
          });
        }
        try {
          await markIdentityRegistrationState(
            prepared.persistedIdentity ?? prepared.agentIdentity,
            input.identityDir ?? getDefaultIdentityStoreDir(),
            "failed",
            body,
          );
        } catch {
          // Preserve the Registrar's rejection and diagnostics if the local
          // state store is unavailable.
        }
        return {
          ok: false,
          stage: "failed-submission",
          localIdentity,
          identityDir: input.identityDir ?? getDefaultIdentityStoreDir(),
          errorCategory: "registration rejection",
          errorMessage: JSON.stringify({
            code: serverCode ?? "registration_rejected",
            status: error.status,
            resourceDid: normalizedSubmission.resourceDid,
            registrarDid,
            submittedDidDocumentHash: normalizedSubmission.didDocumentHash,
            protocolVersion: body.protocolVersion,
            details: body,
          }),
          verificationFindings: validation.verificationFindings,
          suggestedNextActions: [
            "Inspect the Registrar/Root rejection body and fix the submission material. If the official Discovery lookup was unavailable, resolve the resource_version_conflict before retrying.",
          ],
        };
      }
      return {
        ok: false,
        stage: "failed-submission",
        localIdentity,
        identityDir: input.identityDir ?? getDefaultIdentityStoreDir(),
        errorCategory: "endpoint error",
        errorMessage: error instanceof Error ? error.message : String(error),
        verificationFindings: validation.verificationFindings,
        suggestedNextActions: [
          "Check endpoint reachability or profile configuration.",
        ],
      };
    }
  } catch (error) {
    return {
      ok: false,
      stage: "failed-validation",
      localIdentity,
      identityDir: localIdentity
        ? (input.identityDir ?? getDefaultIdentityStoreDir())
        : undefined,
      errorCategory: "registration preparation error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: [
        "Check the selected Registrar DID, local identities, and controller registration before retrying.",
      ],
    };
  }
}

function withResourcePackageVersion(
  submission: ResourceRegistrationSubmission,
  packageVersion: string,
): ResourceRegistrationSubmission {
  const didDocument = structuredClone(submission.didDocument);
  for (const service of didDocument.service ?? []) service.version = packageVersion;
  const metadata = didDocument.oanMetadata;
  if (metadata?.resourceDescription && typeof metadata.resourceDescription === "object") {
    (metadata.resourceDescription as Record<string, unknown>).version = packageVersion;
  }
  if (metadata?.agentDescription && typeof metadata.agentDescription === "object") {
    (metadata.agentDescription as Record<string, unknown>).version = packageVersion;
  }
  if (metadata?.packageInfo && typeof metadata.packageInfo === "object") {
    (metadata.packageInfo as Record<string, unknown>).version = packageVersion;
  }
  return { ...submission, packageVersion, didDocument };
}

/**
 * Community-skill convention for a metadata-only revision. This is not an
 * OAN protocol version rule: it is used only after the Registrar explicitly
 * rejects the default version because that resource/version already has a
 * different document hash. For example, 1.0.1 -> 1.0.1.1 -> 1.0.1.2.
 */
async function discoverOfficialPackageVersion(
  resourceDid: string,
  fetchImpl: typeof fetch | undefined,
): Promise<string | undefined> {
  try {
    const endpoint = `${DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.discoveryEndpoint}/discovery/index/resources/${encodeURIComponent(resourceDid)}`;
    const response = await (fetchImpl ?? globalThis.fetch.bind(globalThis))(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const body = await response.json() as Record<string, unknown>;
    const resourcePackage = body.package && typeof body.package === "object"
      ? body.package as Record<string, unknown>
      : body;
    const didDocument = resourcePackage.didDocument && typeof resourcePackage.didDocument === "object"
      ? resourcePackage.didDocument as Record<string, unknown>
      : undefined;
    const metadata = didDocument?.oanMetadata && typeof didDocument.oanMetadata === "object"
      ? didDocument.oanMetadata as Record<string, unknown>
      : undefined;
    const packageInfo = metadata?.packageInfo && typeof metadata.packageInfo === "object"
      ? metadata.packageInfo as Record<string, unknown>
      : undefined;
    if (typeof packageInfo?.version === "string") return packageInfo.version;
    return typeof resourcePackage.packageVersion === "string"
      ? resourcePackage.packageVersion
      : undefined;
  } catch {
    return undefined;
  }
}

function incrementResourceRevision(version: string, fallbackAttempt: number): string {
  const match = String(version).trim().match(/^(\d+(?:\.\d+)+)$/);
  if (!match) throw new Error("resource_version_conflict_requires_numeric_package_version");
  const parts = match[1].split(".");
  if (parts.length < 4) parts.push(String(fallbackAttempt + 1));
  else parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join(".");
}

async function prepareSubmission(
  input: RegistrationSkillInput,
  registrarDid: string,
): Promise<{
  submission: ResourceRegistrationSubmission;
  subjectIdentity?: OanIdentityRecord;
  agentIdentity?: OanIdentityRecord;
  persistedIdentity?: OanIdentityRecord;
}> {
  if (input.submission) {
    const directory = input.identityDir ?? getDefaultIdentityStoreDir();
    const snapshot = await loadIdentityStoreSnapshot(directory);
    const resourceIdentity =
      input.resourceIdentity ??
      [...snapshot.agents, ...snapshot.subjects].find(
        (record) => record.did === input.submission!.resourceDid,
      );
    const controllerId = input.controllerIdentityId ?? input.subjectIdentityId;
    const controllerIdentity = input.controllerIdentity ?? (controllerId
      ? [...snapshot.agents, ...snapshot.subjects].find(record => record.id === controllerId)
      : undefined);
    if (controllerId && !controllerIdentity) throw new Error("controller_identity_not_found");
    return {
      submission: input.submission,
      subjectIdentity: controllerIdentity ?? input.resourceIdentity,
      // Re-sign only when the caller explicitly provides local key material.
      // Merely finding a stored identity must not mutate a reviewed draft.
      agentIdentity: input.resourceIdentity,
      persistedIdentity: resourceIdentity,
    };
  }
  if (!input.generateIdentity) {
    throw new Error("missing_submission_or_generate_identity");
  }

  const identityDir = input.identityDir ?? getDefaultIdentityStoreDir();
  const snapshot = await loadIdentityStoreSnapshot(identityDir);
  const controllerId = input.controllerIdentityId ?? input.subjectIdentityId;
  let selectedSubject = controllerId
    ? [...snapshot.subjects, ...snapshot.agents].find(
        (record) => record.id === controllerId,
      )
    : input.controllerIdentity;
  if (controllerId && !selectedSubject)
    throw new Error("controller_identity_not_found");

  let agentIdentity: OanIdentityRecord | undefined;
  if (input.agentIdentityId) {
    agentIdentity = [...snapshot.agents, ...snapshot.subjects].find(
      (record) => record.id === input.agentIdentityId,
    );
    if (!agentIdentity) throw new Error("agent_identity_not_found");
    if (
      agentIdentity.profile.resourceType !== input.generateIdentity.resourceType
    )
      throw new Error("resource_identity_type_mismatch");
    const ownerDid = agentIdentity.profile.ownerSubjectDid ?? agentIdentity.did;
    if (agentIdentity.did.split(":")[2] !== registrarDid.split(":")[3]?.slice(0, 5))
      throw new Error("resource_identity_registrar_mismatch");
    if (selectedSubject && selectedSubject.did !== ownerDid)
      throw new Error("controller_identity_mismatch");
    if (!selectedSubject && ownerDid !== agentIdentity.did) {
      selectedSubject = [...snapshot.subjects, ...snapshot.agents].find(
        (record) => record.did === ownerDid,
      );
      if (!selectedSubject)
        throw new Error("registered_controller_identity_required_for_reuse");
    }
  } else {
    const existing = [...snapshot.agents, ...snapshot.subjects].find(
      (record) =>
        record.profile.label === input.generateIdentity!.resourceLabel &&
        record.profile.resourceType === input.generateIdentity!.resourceType &&
        record.profile.metadata?.registrarDid === registrarDid &&
        (record.didDocument.oanMetadata?.controllerDid ?? record.did) ===
          (selectedSubject?.did ?? record.did) &&
        record.profile.metadata?.registrationState !== "registered",
    );
    if (existing) {
      agentIdentity = existing;
    } else {
    const record = await createOanIdentityRecord({
      kind:
        input.generateIdentity.resourceType === "controller"
          ? "subject"
          : "agent",
      label: input.generateIdentity.resourceLabel,
      resourceType: input.generateIdentity.resourceType,
      ownerSubjectDid: selectedSubject?.did,
      description: input.generateIdentity.description,
      capabilityTags: input.generateIdentity.capabilityTags,
      authorizedDomains: input.generateIdentity.authorizedDomains,
      serviceEndpoint: input.generateIdentity.endpoint,
      manifestUrl: input.generateIdentity.manifestUrl,
      schemaUrl: input.generateIdentity.schemaUrl,
      registrarDid,
      metadata: { registrationState: "pending", registrarDid },
    });
    agentIdentity = record;
    await saveIdentityStoreSnapshot(
      upsertIdentityRecord(snapshot, record),
      identityDir,
    );
    }
  }

  const submission = createRegistrationSubmissionFromIdentity(agentIdentity, {
    endpoint: input.generateIdentity.endpoint,
    manifestUrl: input.generateIdentity.manifestUrl,
    schemaUrl: input.generateIdentity.schemaUrl,
    capabilityTags: input.generateIdentity.capabilityTags,
    authorizedDomains: input.generateIdentity.authorizedDomains,
    description: input.generateIdentity.description,
    packageVersion: input.generateIdentity.packageVersion,
    protocol: input.generateIdentity.protocol,
  });
  setGeneratedResourceVersion(submission);

  return {
    submission,
    subjectIdentity: selectedSubject ?? agentIdentity,
    agentIdentity,
  };
}

/** SDK-generated default services belong to this resource's package version. */
function setGeneratedResourceVersion(submission: ResourceRegistrationSubmission): void {
  for (const service of submission.didDocument.service ?? []) service.version = submission.packageVersion;
  const description = submission.didDocument.oanMetadata?.resourceDescription;
  if (description) description.version = submission.packageVersion;
}

async function markIdentityRegistrationState(
  identity: OanIdentityRecord | undefined,
  identityDir: string,
  state: "registered" | "failed",
  error?: unknown,
): Promise<void> {
  if (!identity) return;
  const snapshot = await loadIdentityStoreSnapshot(identityDir);
  const records = [...snapshot.subjects, ...snapshot.agents, ...snapshot.nodes];
  const current = records.find((record) => record.id === identity.id);
  if (!current) return;
  current.profile.metadata = {
    ...(current.profile.metadata ?? {}),
    registrationState: current.profile.metadata?.registrationState === "registered"
      ? "registered" : state,
    lastRegistrationError: error,
    registrationStateUpdatedAt: new Date().toISOString(),
  };
  await saveIdentityStoreSnapshot(snapshot, identityDir);
}

export function assertSubmissionProofFresh(submission: ResourceRegistrationSubmission): void {
  const proofs = [submission.subjectControlProof, submission.controllerAuthorizationProof]
    .filter(Boolean) as Array<{ challenge?: { expiresAt?: string } }>;
  for (const proof of proofs) {
    const expiresAt = proof.challenge?.expiresAt;
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
      throw new Error("registration_proof_expired_before_submission");
    }
  }
}

async function finalizeRegistrationSubmissionWithControllerProof(
  prepared: {
    submission: ResourceRegistrationSubmission;
    subjectIdentity?: OanIdentityRecord;
    agentIdentity?: OanIdentityRecord;
  },
  registrarDid: string,
): Promise<ResourceRegistrationSubmission> {
  if (!prepared.agentIdentity) {
    if (!prepared.submission.subjectControlProof)
      throw new Error("subject_control_proof_required_or_resource_identity");
    const proof = prepared.submission.subjectControlProof;
    if (proof.challenge.registrarDid !== registrarDid)
      throw new Error("registrar_did_endpoint_mismatch");
    if (
      proof.challenge.subjectDid !== prepared.submission.resourceDid ||
      proof.challenge.didDocumentHash !== prepared.submission.didDocumentHash
    )
      throw new Error("subject_control_proof_binding_mismatch");
    if (
      Date.parse(proof.challenge.expiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(proof.challenge.expiresAt))
    )
      throw new Error("subject_control_proof_expired");
    const controller =
      prepared.submission.didDocument.oanMetadata?.controllerDid;
    if (controller && controller !== prepared.submission.resourceDid) {
      const authorization = prepared.submission.controllerAuthorizationProof;
      if (
        !authorization ||
        authorization.challenge.registrarDid !== registrarDid ||
        authorization.challenge.controllerDid !== controller ||
        authorization.challenge.resourceDid !==
          prepared.submission.resourceDid ||
        !Number.isFinite(Date.parse(authorization.challenge.expiresAt)) ||
        Date.parse(authorization.challenge.expiresAt) <= Date.now() ||
        authorization.challenge.didDocumentHash !==
          prepared.submission.didDocumentHash ||
        authorization.challenge.metadataHash !==
          prepared.submission.metadataHash
      )
        throw new Error("controller_authorization_proof_binding_mismatch");
    }
    return structuredClone(prepared.submission);
  }
  const now = new Date();
  const submission = await finalizeRegistrationSubmission(
    prepared.submission,
    now,
  );
  if (prepared.subjectIdentity) {
    const signed = await finalizeRegistrationSubmissionWithProof(submission, {
      resourceIdentity:
        prepared.agentIdentity ??
        (() => {
          throw new Error("resource_identity_missing");
        })(),
      controllerIdentity: prepared.subjectIdentity,
      registrarDid,
      now,
    });
    preserveControllerDocument(signed, prepared.subjectIdentity);
    return signed;
  }
  return submission;
}

/** SDK 1.1.0 rewrites controller metadata, invalidating its registered document proof. */
export function preserveControllerDocument(
  submission: ResourceRegistrationSubmission,
  controller: OanIdentityRecord,
): void {
  if (submission.controllerAuthorizationProof) {
    // This proof signs canonical challenge bytes (not JSON-LD proof options).
    // Rust additionally requires creator even when verificationMethod exists.
    submission.controllerAuthorizationProof.proof.creator ??= controller.did;
    if (!controller.didDocument.proof)
      throw new Error("registered_controller_signed_document_required");
    submission.controllerAuthorizationProof.controllerDidDocument =
      structuredClone(controller.didDocument);
    assertPublicMaterial(
      submission.controllerAuthorizationProof.controllerDidDocument,
    );
  }
}

export function assertPublicMaterial(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      [
        "privateKeyJwk",
        "privateKeyMultibase",
        "privateKeyBase58",
        "secretKey",
        "seed",
      ].includes(key) ||
      (key === "d" && "kty" in value)
    )
      throw new Error("private_key_material_in_public_submission");
    assertPublicMaterial(entry);
  }
}

export async function finalizeRegistrationSubmission(
  input: ResourceRegistrationSubmission,
  timestamp = new Date(),
): Promise<ResourceRegistrationSubmission> {
  const submission = normalizeRegistrationSubmissionForOan(input);
  const hashAlgorithm = submission.hashAlgorithm || "sha256";
  const now = timestamp.toISOString();

  submission.hashAlgorithm = hashAlgorithm;
  submission.packageVersion = submission.packageVersion || "1.0.0";
  submission.didDocument = enrichDidDocumentMetadata(
    submission.didDocument as Record<string, unknown>,
    submission,
  ) as ResourceRegistrationSubmission["didDocument"];

  const didDocumentHash = `${hashAlgorithm}:${await hashDidDocumentWithProof(submission.didDocument)}`;
  submission.didDocumentHash = didDocumentHash;

  const metadata = buildResourceMetadata(submission, now);
  submission.metadataHash = `${hashAlgorithm}:${hashJson(metadata)}`;
  submission.packageHash = `${hashAlgorithm}:${await hashRegistrationPackageBinding(submission)}`;
  submission.metadata = {
    ...(typeof submission.metadata === "object" && submission.metadata
      ? submission.metadata
      : {}),
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
  // serde(default) Vec fields without skip_serializing_if must be present,
  // even when empty. This is especially common for dedicated controllers.
  metadata.capabilityTags ??= [];
  metadata.authorizedDomains ??= [];
  if (metadata.resourceDescription) {
    const description = { ...asRecord(metadata.resourceDescription) };
    description.capabilityTags ??= [];
    description.useCaseExamples ??= [];
    metadata.resourceDescription = description;
  }
  if (metadata.agentDescription) {
    const description = { ...asRecord(metadata.agentDescription) };
    description.capabilityTags ??= [];
    description.useCaseExamples ??= [];
    metadata.agentDescription = description;
  }
  const packageInfo: Record<string, unknown> = {
    ...asRecord(metadata.packageInfo),
    version: submission.packageVersion,
  };
  // PackageInfo is deny_unknown_fields in the wire protocol. Hash algorithm
  // belongs to the submission, not the DID document's packageInfo.
  delete (packageInfo as Record<string, unknown>).hashAlgorithm;
  for (const field of ["packageHash", "metadataHash"] as const) {
    if (/^sha256:0{64}$/.test(String(packageInfo[field])))
      delete packageInfo[field];
  }
  metadata.packageInfo = packageInfo;
  metadata.implementationLinks = normalizeImplementationLinks(
    metadata.implementationLinks,
    submission,
  );
  metadata.credentialRequirements = normalizeCredentialRequirements(
    metadata.credentialRequirements,
  );
  // Rust OanMetadata omits these empty vectors during serialization. Apply
  // that projection before signing, not merely while hashing, so the signed
  // wire document and the Root's typed document have identical content.
  for (const field of ["implementationLinks", "credentialRequirements", "protocolBindings", "externalIdentifiers"] as const) {
    if (Array.isArray(metadata[field]) && metadata[field].length === 0) {
      delete metadata[field];
    }
  }
  return {
    ...didDocument,
    verificationMethod: didDocument.verificationMethod ?? [],
    authentication: didDocument.authentication ?? [],
    assertionMethod: didDocument.assertionMethod ?? [],
    service: didDocument.service ?? [],
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

function normalizeCredentialRequirements(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item);
    return {
      id: record.id ?? submissionRequirementId(record),
      credentialType: record.credentialType ?? record.type,
      purpose: record.purpose ?? asRecord(record.scope).purpose,
      issuer: record.issuer,
      scope: record.scope,
      presentationMode: record.presentationMode,
      required: record.required ?? true,
    };
  });
}

function submissionRequirementId(record: Record<string, unknown>): string {
  return `requirement-${String(record.credentialType ?? record.type ?? "credential")}`;
}

function buildResourceMetadata(
  submission: ResourceRegistrationSubmission,
  now: string,
): Record<string, unknown> {
  const oanMetadata = asRecord(submission.didDocument.oanMetadata);
  const resourceDescription = asRecord(oanMetadata.resourceDescription);
  return {
    resourceDid: submission.resourceDid,
    resourceType: submission.resourceType,
    subjectType: submission.resourceType,
    publisherDid: oanMetadata.publisherDid,
    subjectDid: submission.resourceDid,
    name: resourceDescription.name ?? "Untitled OAN resource",
    description: resourceDescription.description ?? "",
    capabilityTags:
      oanMetadata.capabilityTags ?? resourceDescription.capabilityTags ?? [],
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

function hashJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
    return [
      "The resource is now visible in Discovery and ready for query workflows.",
    ];
  }
  if (stage === "published-to-cdn") {
    return ["Wait for Discovery indexing or run a visibility check."];
  }
  if (stage === "accepted-by-root" || stage === "queued-at-root") {
    return [
      "Wait for CDN publication to complete, then re-check lifecycle state.",
    ];
  }
  return [
    "Continue observing lifecycle progression through Root, CDN, and Discovery.",
  ];
}
