// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import {
  assertDidOan,
  assertDidSubjectMatchesResourceType,
  assertSupportedInitialResourceType,
  normalizeRegistrationSubmissionForOan,
  verifyDidDocumentServiceBindings,
  verifyHashLike,
} from "../../oan-sdk-ts/packages/sdk-ts/src/index.js";
import type {
  SkillActionResult,
  ValidationSkillInput,
  ValidationSkillOutput,
} from "./types.js";

export function validateRegistrationInput(
  input: ValidationSkillInput,
): SkillActionResult<ValidationSkillOutput> {
  if (!input.submission) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "submission is required for direct validation",
      suggestedNextActions: ["Provide a prepared submission or let register() generate one from local identity material."],
    };
  }
  const findings: string[] = [];
  const submission = normalizeRegistrationSubmissionForOan(input.submission);
  const resourceDid = String(submission.resourceDid ?? "");
  const resourceType = String(submission.resourceType ?? "");

  try {
    assertDidOan(resourceDid);
    assertSupportedInitialResourceType(submission.resourceType);
    findings.push("resourceDid uses did:oan shape");
    assertDidSubjectMatchesResourceType(resourceDid, submission.resourceType);
    findings.push("resourceDid subject code matches resourceType");
    verifyDidDocumentServiceBindings(submission.didDocument);
    findings.push("protocolBindings reference declared DID services when present");
  } catch (error) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Fix the resourceDid and resourceType pairing."],
    };
  }

  if (!submission.didDocument || submission.didDocument.id !== resourceDid) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "didDocument.id must equal submission.resourceDid",
      suggestedNextActions: ["Align didDocument.id with resourceDid."],
    };
  }

  if (submission.didDocument.oanMetadata?.resourceType !== submission.resourceType) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "oanMetadata.resourceType must equal submission.resourceType",
      suggestedNextActions: ["Align oanMetadata.resourceType with the submission resourceType."],
    };
  }

  if (submission.didDocument.oanMetadata?.subjectType !== submission.resourceType) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "oanMetadata.subjectType must equal submission.resourceType",
      suggestedNextActions: ["Align oanMetadata.subjectType with the submission resourceType."],
    };
  }

  const domainError = validateCommunityAuthorizedDomains(
    submission.didDocument.oanMetadata?.authorizedDomains,
  );
  if (domainError) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: domainError,
      suggestedNextActions: [
        domainError === "resource_domains_required"
          ? "Add explicit didDocument.oanMetadata.authorizedDomains before final registration."
          : "Use sorted, unique canonical domains, or the single wildcard [\"*\"].",
      ],
    };
  }
  findings.push("authorizedDomains are explicit and well-formed");

  if (!submission.packageHash || !submission.metadataHash || !submission.hashAlgorithm) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "packageHash, metadataHash, and hashAlgorithm are required",
      suggestedNextActions: ["Provide hash material before submission."],
    };
  }
  try {
    verifyHashLike(submission.packageHash, "packageHash");
    verifyHashLike(submission.metadataHash, "metadataHash");
  } catch (error) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Use algorithm:value style hashes, for example sha256:..."],
    };
  }

  findings.push("didDocument metadata matches submission resource type");
  findings.push("package hash material is present");
  findings.push("hash values use algorithm:value format");
  if (!submission.packageVersion) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: "packageVersion is required",
      suggestedNextActions: ["Provide a packageVersion before submission."],
    };
  }
  findings.push("packageVersion is present");

  return {
    ok: true,
    stage: "draft-prepared",
    data: {
      normalizedResourceDid: resourceDid,
      resourceType,
      findings,
    },
    verificationFindings: findings,
    suggestedNextActions: ["Submit the validated resource to a Registrar endpoint."],
  };
}

export function validateCommunityAuthorizedDomains(
  domains: unknown,
): "resource_domains_required" | "invalid_authorized_domains" | undefined {
  if (!Array.isArray(domains) || domains.length === 0) {
    return "resource_domains_required";
  }
  if (domains.some((domain) => typeof domain !== "string")) {
    return "invalid_authorized_domains";
  }
  const values = domains as string[];
  if (values.includes("*")) {
    return values.length === 1 ? undefined : "invalid_authorized_domains";
  }
  for (const domain of values) {
    if (
      domain.trim() !== domain ||
      domain.length === 0 ||
      !/^[a-z0-9_.*]+$/.test(domain) ||
      domain.startsWith(".") ||
      domain.endsWith(".") ||
      domain.includes("..")
    ) {
      return "invalid_authorized_domains";
    }
  }
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) {
      return "invalid_authorized_domains";
    }
  }
  return undefined;
}
