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

export async function registerResourceWithSkill(
  profile: OanSkillProfile,
  input: RegistrationSkillInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<RegistrationSkillOutput>> {
  const prepared = await prepareSubmission(input);
  const normalizedSubmission = normalizeRegistrationSubmissionForOan(prepared.submission);
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
  submission: ReturnType<typeof normalizeRegistrationSubmissionForOan>;
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
