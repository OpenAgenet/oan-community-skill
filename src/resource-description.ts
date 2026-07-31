// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { createHash } from "node:crypto";
import {
  createAgentIdentityNode,
  ensureSubjectIdentityNode,
  loadIdentityStoreSnapshot,
  saveIdentityStoreSnapshot,
} from "../../oan-sdk-ts/packages/sdk-ts/src/identity-store-node.js";
import { createRegistrationSubmissionFromIdentity } from "../../oan-sdk-ts/packages/sdk-ts/src/identity.js";
import type { OanIdentityRecord } from "../../oan-sdk-ts/packages/sdk-ts/src/identity.js";
import type {
  ImplementationLink,
  ProtocolBinding,
  ResourceRegistrationSubmission,
  ResourceType,
} from "../../oan-sdk-ts/packages/protocol-types/src/index.js";
import { registerResourceWithSkill } from "./registration.js";
import type {
  CommunityRegistrableResourceType,
  OanSkillProfile,
  ResourceDescriptionDraftOutput,
  ResourceDescriptionBatchRegistrationInput,
  ResourceDescriptionBatchRegistrationOutput,
  ResourceDescriptionRegistrationCandidate,
  ResourceDescriptionRegistrationInput,
  ResourceDescriptionRegistrationOutput,
  SkillActionResult,
} from "./types.js";

export async function draftRegistrationFromResourceDescriptionWithSkill(
  input: ResourceDescriptionRegistrationInput,
): Promise<SkillActionResult<ResourceDescriptionDraftOutput>> {
  try {
    const candidate = parseResourceDescription(input);
    const missingInputs = findMissingInputs(candidate);
    const qualityIssues = findQualityIssues(candidate);
    const output: ResourceDescriptionDraftOutput = {
      candidate,
      missingInputs,
      qualityIssues,
    };

    if (missingInputs.length === 0) {
      output.submission = await createSubmission(candidate, input);
    }

    return {
      ok: missingInputs.length === 0,
      stage: missingInputs.length === 0 ? "draft-prepared" : "failed-validation",
      data: output,
      missingInputs,
      verificationFindings: [
        "Resource description was parsed into editable OAN registration metadata.",
        ...(output.submission ? ["A did:oan registration submission draft was generated."] : []),
      ],
      suggestedNextActions: suggestedNextActions(missingInputs, qualityIssues),
    };
  } catch (error) {
    return {
      ok: false,
      stage: "failed-validation",
      errorCategory: "input error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Provide markdown, plain text, or structured overrides with resource registration facts."],
    };
  }
}

export async function registerFromResourceDescriptionWithSkill(
  profile: OanSkillProfile,
  input: ResourceDescriptionRegistrationInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<ResourceDescriptionRegistrationOutput>> {
  const draft = await draftRegistrationFromResourceDescriptionWithSkill(input);
  if (!draft.ok || !draft.data?.submission) {
    return {
      ok: false,
      stage: draft.stage,
      data: draft.data
        ? {
            candidate: draft.data.candidate,
            missingInputs: draft.data.missingInputs,
            qualityIssues: draft.data.qualityIssues,
          }
        : undefined,
      errorCategory: draft.errorCategory ?? "input error",
      errorMessage: draft.errorMessage ?? "resource_description_missing_required_registration_fields",
      missingInputs: draft.missingInputs ?? draft.data?.missingInputs,
      verificationFindings: draft.verificationFindings,
      suggestedNextActions: suggestedNextActions(
        draft.missingInputs ?? draft.data?.missingInputs ?? [],
        draft.data?.qualityIssues ?? [],
      ),
    };
  }

  const registration = await registerResourceWithSkill(profile, { submission: draft.data.submission }, options);
  return {
    ...registration,
    data: {
      candidate: draft.data.candidate,
      registration: registration.data?.registration,
      lifecycle: registration.data?.lifecycle,
      subjectIdentity: registration.data?.subjectIdentity,
      agentIdentity: registration.data?.agentIdentity,
      qualityIssues: draft.data.qualityIssues,
    },
    suggestedNextActions: registration.ok
      ? suggestedNextActions([], draft.data.qualityIssues ?? [])
      : [
          ...(registration.suggestedNextActions ?? []),
          "Check the Registrar response, endpoint reachability, authorizedDomains, and package metadata, then retry the same description with corrected overrides.",
        ],
  };
}

export async function registerBatchFromResourceDescriptionsWithSkill(
  profile: OanSkillProfile,
  input: ResourceDescriptionBatchRegistrationInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<ResourceDescriptionBatchRegistrationOutput>> {
  const results: ResourceDescriptionBatchRegistrationOutput["results"] = [];

  for (const [index, item] of input.items.entries()) {
    const id = item.id ?? item.sourcePath ?? `item-${index + 1}`;
    const result = await registerFromResourceDescriptionWithSkill(
      profile,
      {
        markdown: item.markdown,
        text: item.text,
        identityDir: input.identityDir,
        subjectLabel: input.subjectLabel,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        overrides: item.overrides,
      },
      options,
    );

    const missingInputs = result.missingInputs ?? result.data?.missingInputs;
    results.push({
      id,
      sourcePath: item.sourcePath,
      status: result.ok ? "registered" : missingInputs?.length ? "skipped" : "failed",
      stage: result.stage,
      resourceDid: result.data?.registration?.resourceDid,
      candidate: result.data?.candidate,
      missingInputs,
      qualityIssues: result.data?.qualityIssues,
      errorCategory: result.errorCategory,
      errorMessage: result.errorMessage,
      suggestedNextActions: result.suggestedNextActions,
    });

    if (!result.ok && input.stopOnFailure) break;
  }

  const summary = {
    total: input.items.length,
    registered: results.filter((item) => item.status === "registered").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
  };

  return {
    ok: summary.registered > 0 && summary.failed === 0,
    stage: summary.skipped || summary.failed ? "failed-validation" : "visible-in-discovery",
    data: { summary, results },
    verificationFindings: [
      `Processed ${results.length} resource description item(s).`,
      `Registered ${summary.registered}; skipped ${summary.skipped}; failed ${summary.failed}.`,
    ],
    suggestedNextActions:
      summary.skipped || summary.failed
        ? ["Review skipped or failed items, fill missing inputs or fix Registrar errors, then retry those items only."]
        : ["Run Discovery checks for the registered resources and preserve the batch result as the registration log."],
  };
}

export function parseResourceDescription(
  input: ResourceDescriptionRegistrationInput,
): ResourceDescriptionRegistrationCandidate {
  const body = input.markdown ?? input.text ?? "";
  if (!body.trim() && !input.overrides) {
    throw new Error("resource_description_required");
  }

  const fields = parseSuggestedMetadata(body);
  const sourceAccess = parseSourceAndAccess(body);
  const inferredName = fields.name ?? heading(body) ?? inferNameFromText(body);
  const description =
    extractBlockquoteAfter(body, "Suggested registration description") ??
    fieldValue(fields.description) ??
    firstParagraph(body);
  const resourceType = normalizeResourceType(fields.resourceType ?? input.overrides?.resourceType);
  const protocol = cleanupText(fields.protocol ?? input.overrides?.protocol ?? defaultProtocol(resourceType));
  const endpoint =
    usefulUrl(fields.endpoint) ??
    usefulUrl(input.overrides?.endpoint) ??
    usefulUrl(fields.packageUrl) ??
    usefulUrl(fields.downloadUrl) ??
    firstUrl(body);
  const packageUrl = usefulUrl(fields.packageUrl) ?? usefulUrl(sourceAccess.packageUrl);
  const repositoryUrl = usefulUrl(fields.repositoryUrl) ?? usefulUrl(sourceAccess.repositoryUrl);
  const manifestUrl =
    usefulUrl(fields.manifestUrl) ?? usefulUrl(input.overrides?.manifestUrl) ?? endpoint ?? packageUrl ?? repositoryUrl;
  const schemaUrl = usefulUrl(fields.schemaUrl) ?? usefulUrl(input.overrides?.schemaUrl) ?? manifestUrl;
  const downloadUrl =
    usefulUrl(fields.downloadUrl) ?? usefulUrl(input.overrides?.downloadUrl) ?? packageUrl ?? repositoryUrl ?? endpoint;
  const originalDescription = cleanupText(description);
  const baseCandidate: ResourceDescriptionRegistrationCandidate = {
    sourceName: cleanupOptional(input.sourceName ?? fields.sourceDataset ?? sourceAccess.sourceDataset),
    sourceUrl: usefulUrl(input.sourceUrl) ?? usefulUrl(sourceAccess.sourceUrl),
    resourceType,
    name: cleanupText(inferredName),
    description: originalDescription,
    version: cleanupText(fields.version ?? input.overrides?.version ?? "1.0.0"),
    endpoint,
    protocol,
    manifestUrl,
    schemaUrl,
    downloadUrl,
    repositoryUrl,
    packageUrl,
    authorizedDomains: splitList(fields.authorizedDomains ?? input.overrides?.authorizedDomains?.join(";") ?? ""),
    capabilityTags: unique([
      resourceType,
      ...splitList(fields.capabilityTags ?? input.overrides?.capabilityTags?.join(";") ?? ""),
      ...deriveTags(inferredName, originalDescription),
    ]).slice(0, 16),
    useCases: splitList(fields.useCases ?? input.overrides?.useCases?.join(";") ?? ""),
    inputs: splitList(fields.inputs ?? input.overrides?.inputs?.join(";") ?? ""),
    outputs: splitList(fields.outputs ?? input.overrides?.outputs?.join(";") ?? ""),
    license: normalizeUnknown(fields.license ?? input.overrides?.license),
    maintainer: normalizeUnknown(fields.maintainer ?? input.overrides?.maintainer),
  };
  const candidate = normalizeCandidate({ ...baseCandidate, ...input.overrides });
  return normalizeCandidate({
    ...candidate,
    description: registrationDescriptionFromResourceMaterial(candidate, body),
    capabilityDescription: candidate.capabilityDescription ?? capabilityDescriptionFromCandidate(candidate),
  });
}

async function createSubmission(
  candidate: ResourceDescriptionRegistrationCandidate,
  input: ResourceDescriptionRegistrationInput,
): Promise<ResourceRegistrationSubmission> {
  const subject = await ensureSubjectIdentityNode({
    label: input.subjectLabel ?? "OAN Community Publisher",
    identityDir: input.identityDir,
  });
  const agent = input.reuseAgentIdentity
    ? await ensureReusableAgentIdentity(candidate, subject.record.did, subject.identityDir)
    : await createAgentIdentityNode({
        label: candidate.name,
        resourceType: candidate.resourceType,
        ownerSubjectDid: subject.record.did,
        identityDir: subject.identityDir,
        description: candidate.description,
        capabilityTags: candidate.capabilityTags,
        authorizedDomains: candidate.authorizedDomains,
        serviceEndpoint: candidate.endpoint,
        manifestUrl: candidate.manifestUrl,
        schemaUrl: candidate.schemaUrl,
      });
  const submission = createRegistrationSubmissionFromIdentity(agent.record, {
    endpoint: candidate.endpoint,
    manifestUrl: candidate.manifestUrl,
    schemaUrl: candidate.schemaUrl,
    protocol: candidate.protocol,
    capabilityTags: candidate.capabilityTags,
    authorizedDomains: candidate.authorizedDomains,
    description: candidate.description,
    packageVersion: candidate.version,
  });
  enrichSubmission(submission, candidate);
  return submission;
}

async function ensureReusableAgentIdentity(
  candidate: ResourceDescriptionRegistrationCandidate,
  ownerSubjectDid: string,
  identityDir: string,
): Promise<{ record: OanIdentityRecord; identityDir: string }> {
  const snapshot = await loadIdentityStoreSnapshot(identityDir);
  const existing =
    snapshot.agents.find((record) => record.id === snapshot.defaultAgentId) ??
    snapshot.agents.find((record) => record.profile.resourceType === candidate.resourceType);
  if (!existing) {
    return createAgentIdentityNode({
      label: candidate.name,
      resourceType: candidate.resourceType,
      ownerSubjectDid,
      identityDir,
      description: candidate.description,
      capabilityTags: candidate.capabilityTags,
      authorizedDomains: candidate.authorizedDomains,
      serviceEndpoint: candidate.endpoint,
      manifestUrl: candidate.manifestUrl,
      schemaUrl: candidate.schemaUrl,
    });
  }
  existing.profile = {
    ...existing.profile,
    label: candidate.name,
    description: candidate.description,
    capabilityTags: candidate.capabilityTags,
    authorizedDomains: candidate.authorizedDomains,
  };
  existing.didDocument.oanMetadata = {
    ...(existing.didDocument.oanMetadata ?? {}),
    subjectType: existing.didDocument.oanMetadata?.subjectType ?? candidate.resourceType,
    resourceType: existing.didDocument.oanMetadata?.resourceType ?? candidate.resourceType,
    resourceDescription: {
      ...(existing.didDocument.oanMetadata?.resourceDescription ?? {}),
      name: candidate.name,
      description: candidate.description,
      capabilityDescription: candidate.capabilityDescription,
      capabilityTags: candidate.capabilityTags,
    },
    capabilityTags: candidate.capabilityTags,
    authorizedDomains: candidate.authorizedDomains,
  };
  await saveIdentityStoreSnapshot(snapshot, identityDir);
  return { record: existing, identityDir };
}

function enrichSubmission(
  submission: ResourceRegistrationSubmission,
  candidate: ResourceDescriptionRegistrationCandidate,
): void {
  const metadata = submission.didDocument.oanMetadata;
  if (!metadata) return;
  metadata.resourceDescription = {
    ...metadata.resourceDescription,
    name: candidate.name,
    description: candidate.description,
    capabilityDescription: candidate.capabilityDescription,
    capabilityTags: candidate.capabilityTags,
    useCaseExamples: candidate.useCases,
    inputs: candidate.inputs,
    outputs: candidate.outputs,
    sourceDataset: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    upstreamMaintainer: candidate.maintainer,
    license: candidate.license,
    version: candidate.version,
  };
  metadata.implementationLinks = [
    link("catalog", candidate.packageUrl),
    link("repository", candidate.repositoryUrl),
    link("manifest", candidate.manifestUrl),
    link("download", candidate.downloadUrl),
  ].filter((item): item is ImplementationLink => Boolean(item));
  metadata.protocolBindings = [
    {
      id: `${submission.resourceDid}#binding-primary`,
      protocol: candidate.protocol ?? defaultProtocol(candidate.resourceType),
      version: candidate.version,
      serviceRef: firstServiceRef(submission),
      schemaRef: candidate.schemaUrl,
      sourceFormat: candidate.sourceName ? `${candidate.sourceName} resource description` : "resource description",
    },
  ] satisfies ProtocolBinding[];
  metadata.packageInfo = {
    ...metadata.packageInfo,
    manifestUrl: candidate.manifestUrl,
    downloadUrl: candidate.downloadUrl,
    sourcePageUrl: candidate.packageUrl,
    repositoryUrl: candidate.repositoryUrl,
    version: candidate.version,
    versionScheme: isSemver(candidate.version) ? "semver" : "upstream",
    packageHash: `sha256:${hashJson({
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      name: candidate.name,
      resourceType: candidate.resourceType,
      version: candidate.version,
      endpoint: candidate.endpoint,
      manifestUrl: candidate.manifestUrl,
      downloadUrl: candidate.downloadUrl,
    })}`,
  };
}

function parseSuggestedMetadata(markdown: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*`?([^|`]+?)`?\s*\|/);
    if (!match) continue;
    const key = match[1].trim();
    if (["Field", "---"].includes(key)) continue;
    output[key] = match[2].trim();
  }
  return output;
}

function parseSourceAndAccess(markdown: string): Record<string, string> {
  const section = sectionAfter(markdown, "Source And Access");
  const output: Record<string, string> = {};
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s+(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim().replace(/^<|>$/g, "");
    if (key === "source dataset") output.sourceDataset = value;
    if (key === "source url") output.sourceUrl = value;
    if (key === "repository") output.repositoryUrl = value;
    if (key === "package or catalog page") output.packageUrl = value;
  }
  return output;
}

function normalizeCandidate(
  candidate: ResourceDescriptionRegistrationCandidate,
): ResourceDescriptionRegistrationCandidate {
  return {
    ...candidate,
    name: cleanupText(candidate.name),
    description: cleanupText(candidate.description),
    capabilityDescription: cleanupOptional(candidate.capabilityDescription),
    version: cleanupText(candidate.version || "1.0.0"),
    endpoint: usefulUrl(candidate.endpoint),
    manifestUrl: usefulUrl(candidate.manifestUrl),
    schemaUrl: usefulUrl(candidate.schemaUrl),
    downloadUrl: usefulUrl(candidate.downloadUrl),
    repositoryUrl: usefulUrl(candidate.repositoryUrl),
    packageUrl: usefulUrl(candidate.packageUrl),
    authorizedDomains: sortUnique(candidate.authorizedDomains),
    capabilityTags: unique(candidate.capabilityTags.map(normalizeTag).filter(Boolean)).slice(0, 16),
    useCases: unique(candidate.useCases.map(cleanupText).filter(Boolean)),
    inputs: unique(candidate.inputs.map(cleanupText).filter(Boolean)),
    outputs: unique(candidate.outputs.map(cleanupText).filter(Boolean)),
    sourceName: cleanupOptional(candidate.sourceName),
    sourceUrl: usefulUrl(candidate.sourceUrl),
    license: normalizeUnknown(candidate.license),
    maintainer: normalizeUnknown(candidate.maintainer),
  };
}

function findMissingInputs(candidate: ResourceDescriptionRegistrationCandidate): string[] {
  const missing: string[] = [];
  if (!candidate.name) missing.push("name");
  if (!candidate.description) missing.push("description");
  if (!candidate.endpoint && !candidate.manifestUrl && !candidate.downloadUrl) missing.push("publicAccessUrl");
  if (!candidate.authorizedDomains.length) missing.push("authorizedDomains");
  return missing;
}

function findQualityIssues(candidate: ResourceDescriptionRegistrationCandidate): string[] {
  const issues: string[] = [];
  if (candidate.name && candidate.name.length < 2) issues.push("name_too_short");
  if (candidate.description && descriptionTooShort(candidate.description)) {
    issues.push("description_too_short_for_registration");
  }
  if (candidate.description && descriptionTooLong(candidate.description)) {
    issues.push("description_too_long_for_registration");
  }
  if (!candidate.capabilityTags.length) issues.push("capability_tags_empty");
  if (!candidate.useCases.length) issues.push("use_cases_empty");
  if (!candidate.inputs.length) issues.push("inputs_empty");
  if (!candidate.outputs.length) issues.push("outputs_empty");
  if (candidate.capabilityTags.some(hasCjkText)) {
    issues.push("capability_tags_contain_chinese_terms");
  }
  return issues;
}

function normalizeResourceType(value?: string): CommunityRegistrableResourceType {
  const normalized = value?.trim() as ResourceType | undefined;
  if (
    normalized === "agent_service" ||
    normalized === "skill" ||
    normalized === "mcp_server" ||
    normalized === "tool_api"
  ) {
    return normalized;
  }
  return "agent_service";
}

function defaultProtocol(resourceType: CommunityRegistrableResourceType): string {
  if (resourceType === "agent_service") return "https";
  if (resourceType === "mcp_server") return "mcp";
  if (resourceType === "tool_api") return "http-api";
  return "skill";
}

function heading(markdown: string): string | undefined {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function firstParagraph(markdown: string): string {
  return (
    markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("-")) ?? ""
  );
}

function inferNameFromText(text: string): string {
  const first = firstParagraph(text);
  const beforeColon = first.split(/[:：]/)[0]?.trim();
  return beforeColon && beforeColon.length <= 80 ? beforeColon : "";
}

function extractBlockquoteAfter(markdown: string, title: string): string | undefined {
  const index = markdown.indexOf(`## ${title}`);
  if (index < 0) return undefined;
  return markdown.slice(index).match(/^>\s+(.+)$/m)?.[1]?.trim();
}

function sectionAfter(markdown: string, title: string): string {
  const index = markdown.indexOf(`## ${title}`);
  if (index < 0) return "";
  const rest = markdown.slice(index + title.length + 3);
  const next = rest.search(/\n##\s+/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function splitList(value: string): string[] {
  return unique(
    value
      .split(/[;,，；\n]/)
      .map((item) => item.trim().replace(/^`|`$/g, ""))
      .filter((item) => item && item.toLowerCase() !== "unknown"),
  );
}

function deriveTags(name: string, description: string): string[] {
  const text = `${name} ${description}`.toLowerCase();
  const tags: string[] = [];
  const pairs: Array<[RegExp, string]> = [
    [/mcp|model context protocol/, "protocol.mcp"],
    [/pdf|document|powerpoint|presentation|ppt|excel|spreadsheet|word/, "document-processing"],
    [/stock|finance|trading|market|a-share|portfolio/, "finance"],
    [/search|web|browser|crawler|research/, "web-search"],
    [/code|developer|github|api|software|programming/, "developer-tooling"],
    [/image|design|music|video|creative/, "content-creation"],
    [/calendar|task|todo|schedule|automation/, "productivity"],
    [/data|database|sql|analytics|dataset/, "data"],
    [/security|credential|auth|risk|audit|signature/, "security"],
  ];
  for (const [pattern, tag] of pairs) {
    if (pattern.test(text)) tags.push(tag);
  }
  return tags;
}

function link(relation: string, url?: string): ImplementationLink | undefined {
  if (!url) return undefined;
  return { relation, targetService: url };
}

function firstServiceRef(submission: ResourceRegistrationSubmission): string | undefined {
  const serviceId = submission.didDocument.service?.[0]?.id;
  if (typeof serviceId !== "string") return undefined;
  if (serviceId.startsWith(`${submission.resourceDid}#`)) return serviceId.slice(submission.resourceDid.length);
  return serviceId;
}

function suggestedNextActions(missingInputs: string[], qualityIssues: string[] = []): string[] {
  const actions: string[] = [];
  if (!missingInputs.length) {
    actions.push("Review the candidate metadata, especially authorizedDomains and capabilityTags, before registration.");
    actions.push("Submit the generated registration draft through registerFromResourceDescription() or register().");
  } else {
    actions.push(`Fill the missing registration fields: ${missingInputs.join(", ")}.`);
    actions.push("Use overrides when the resource description file does not carry enough structured metadata.");
  }
  if (qualityIssues.includes("description_too_short_for_registration")) {
    actions.push("Expand the resource description to 200-400 words using facts from the resource description material, covering purpose, interfaces, inputs, outputs, and typical use cases.");
  }
  if (qualityIssues.includes("description_too_long_for_registration")) {
    actions.push("Shorten the resource description to a concise 200-400 word registration summary.");
  }
  if (qualityIssues.includes("capability_tags_contain_chinese_terms")) {
    actions.push("Chinese capability tags are allowed but should be reviewed; prefer canonical English tags when suitable equivalents exist.");
  }
  return actions;
}

function cleanupText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function cleanupOptional(value?: string): string | undefined {
  const cleaned = cleanupText(value);
  return normalizeUnknown(cleaned);
}

function normalizeUnknown(value?: string): string | undefined {
  const cleaned = cleanupText(value);
  if (!cleaned || cleaned.toLowerCase() === "unknown") return undefined;
  return cleaned;
}

function usefulUrl(value?: string): string | undefined {
  const cleaned = cleanupText(value).replace(/^<|>$/g, "");
  if (!/^https?:\/\//.test(cleaned)) return undefined;
  if (cleaned.toLowerCase().includes("unknown")) return undefined;
  return cleaned;
}

function firstUrl(value: string): string | undefined {
  return usefulUrl(value.match(/https?:\/\/[^\s>)]+/)?.[0]);
}

function fieldValue(value?: string): string | undefined {
  const cleaned = cleanupText(value);
  return cleaned || undefined;
}

function normalizeTag(value: string): string {
  return cleanupText(value).toLowerCase().replace(/\s+/g, "-");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sortUnique(values: string[]): string[] {
  const uniqueValues = unique(values.map(cleanupText).filter(Boolean));
  if (uniqueValues.includes("*")) return ["*"];
  return uniqueValues.sort();
}

function isSemver(value: string): boolean {
  return /^[0-9]+(\.[0-9]+){1,2}([-.+][0-9A-Za-z.-]+)?$/.test(value);
}

function registrationDescriptionFromResourceMaterial(
  candidate: ResourceDescriptionRegistrationCandidate,
  markdown: string,
): string {
  const original = cleanupText(candidate.description);
  if (!original) return original;
  const originalSentences = splitSentences(original).filter((sentence) => !containsRegistrationContext(sentence));
  const resourceCentricOriginal = cleanupText(originalSentences.join(" "));
  const baseDescription = resourceCentricOriginal || original;
  if (
    !containsRegistrationContext(original) &&
    !descriptionTooShort(baseDescription) &&
    !descriptionTooLong(baseDescription)
  ) {
    return baseDescription;
  }

  const sentences = unique([
    ...splitSentences(baseDescription).filter((sentence) => !containsRegistrationContext(sentence)),
    ...resourceFactSentences(candidate),
    ...extractReadableSentences(markdown),
  ]);
  const concise = trimDescriptionToWordLimit(sentences.join(" "), 400);
  if (!descriptionTooShort(concise)) return concise;

  const expanded = [...sentences];
  for (const sentence of expansionSentences(candidate)) {
    expanded.push(sentence);
    const text = trimDescriptionToWordLimit(unique(expanded).join(" "), 400);
    if (!descriptionTooShort(text)) return text;
  }
  return trimDescriptionToWordLimit(unique(expanded).join(" "), 400);
}

function resourceFactSentences(candidate: ResourceDescriptionRegistrationCandidate): string[] {
  const sentences: string[] = [];
  sentences.push(`${candidate.name} is a ${readableResourceType(candidate.resourceType)}.`);
  if (candidate.endpoint) {
    sentences.push(`The primary public access endpoint is ${candidate.endpoint}.`);
  }
  if (candidate.protocol) {
    sentences.push(`The declared protocol or access model is ${candidate.protocol}.`);
  }
  if (candidate.packageUrl) sentences.push(`The package or catalog page is ${candidate.packageUrl}.`);
  if (candidate.repositoryUrl) sentences.push(`The repository link is ${candidate.repositoryUrl}.`);
  if (candidate.manifestUrl) sentences.push(`The manifest or descriptor URL is ${candidate.manifestUrl}.`);
  if (candidate.downloadUrl) sentences.push(`The download or access URL is ${candidate.downloadUrl}.`);
  if (candidate.capabilityTags.length) {
    sentences.push(`Its capability tags are ${candidate.capabilityTags.join(", ")}.`);
  }
  if (candidate.useCases.length) {
    sentences.push(`The documented use cases include ${candidate.useCases.join("; ")}.`);
  }
  if (candidate.inputs.length) {
    sentences.push(`Documented inputs include ${candidate.inputs.join("; ")}.`);
  }
  if (candidate.outputs.length) {
    sentences.push(`Documented outputs include ${candidate.outputs.join("; ")}.`);
  }
  if (candidate.version) sentences.push(`The observed upstream version or revision is ${candidate.version}.`);
  if (candidate.maintainer) sentences.push(`The listed maintainer is ${candidate.maintainer}.`);
  if (candidate.license) sentences.push(`The listed license is ${candidate.license}.`);
  return sentences;
}

function expansionSentences(candidate: ResourceDescriptionRegistrationCandidate): string[] {
  const access = candidate.endpoint ?? candidate.manifestUrl ?? candidate.downloadUrl ?? candidate.packageUrl;
  return [
    `${candidate.name} is intended for users who need the capabilities described by its metadata, access model, input fields, output fields, and examples.`,
    access
      ? `The public access location ${access} is the starting point for evaluating availability, interface behavior, supported platforms, and compatibility with a user's workflow.`
      : `The available material does not provide an additional public endpoint, so the description stays limited to the named service, access model, and documented behavior.`,
    candidate.inputs.length
      ? `The named input fields describe the information a user or automation is expected to provide before invoking or evaluating the service.`
      : `The available material does not describe additional custom input fields beyond the general interaction implied by the service type and access protocol.`,
    candidate.outputs.length
      ? `The named output fields describe the response a user should expect after the service, skill, server, or API completes its documented action.`
      : `The available material does not describe additional custom output fields beyond the general response implied by the service type and access protocol.`,
    candidate.useCases.length
      ? `The use cases explain when the service is likely to be useful and what tasks it can support.`
      : `The description stays within the known metadata and does not infer use cases that were not present in the resource material.`,
    candidate.capabilityTags.length
      ? `The capability tags provide compact labels, while this description expands those labels into readable context for review and selection.`
      : `The description avoids adding capability claims that are not supported by the resource material.`,
    `This description is intentionally limited to facts found in the resource document, parsed metadata table, public access links, and explicit overrides supplied by the operator.`,
    `Users should still validate availability, permissions, data handling, pricing, and operational fit against the service's public documentation before relying on it in a workflow.`,
  ];
}

function capabilityDescriptionFromCandidate(candidate: ResourceDescriptionRegistrationCandidate): string | undefined {
  const parts: string[] = [];
  if (candidate.capabilityTags.length) {
    parts.push(`${candidate.name} exposes capabilities labeled ${candidate.capabilityTags.join(", ")}.`);
  }
  if (candidate.inputs.length) {
    parts.push(`It accepts ${candidate.inputs.join("; ")} as typical inputs.`);
  }
  if (candidate.outputs.length) {
    parts.push(`It returns ${candidate.outputs.join("; ")} as typical outputs.`);
  }
  if (candidate.useCases.length) {
    parts.push(`It is suitable for ${candidate.useCases.join("; ")}.`);
  }
  const description = cleanupText(parts.join(" "));
  return description ? trimDescriptionToWordLimit(description, 120) : undefined;
}

function extractReadableSentences(markdown: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^>\s*/, "");
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line || line.startsWith("#") || line.startsWith("|") || line.startsWith("-")) continue;
    lines.push(line);
  }
  const text = lines.join(" ");
  return splitSentences(text).filter((sentence) => countWords(sentence) >= 6 && !containsRegistrationContext(sentence));
}

function readableResourceType(resourceType: CommunityRegistrableResourceType): string {
  if (resourceType === "agent_service") return "public agent service";
  if (resourceType === "mcp_server") return "MCP server";
  if (resourceType === "tool_api") return "tool API";
  return "skill";
}

function containsRegistrationContext(value: string): boolean {
  return /\bOAN\b|\bDID\b|\bDiscovery\b|联网智能体数量摸底情况报告|注册审查|registered as|upstream discovery source/i.test(value);
}

function splitSentences(value: string): string[] {
  return cleanupText(value)
    .split(/(?<=[.!?。！？])\s*/)
    .map((sentence) => cleanupText(sentence))
    .filter(Boolean);
}

function trimDescriptionToWordLimit(value: string, limit: number): string {
  if (hasCjkText(value)) return trimCjkDescriptionToLimit(value, limit);
  const words = cleanupText(value).split(/\s+/).filter(Boolean);
  if (words.length <= limit) return cleanupText(value);
  return `${words.slice(0, limit).join(" ").replace(/[,\s]+$/, "")}.`;
}

function descriptionTooShort(value: string): boolean {
  const cleaned = cleanupText(value);
  if (hasCjkText(cleaned)) return countCjkDescriptionUnits(cleaned) < 200;
  return countWords(cleaned) < 200;
}

function descriptionTooLong(value: string): boolean {
  const cleaned = cleanupText(value);
  if (hasCjkText(cleaned)) return countCjkDescriptionUnits(cleaned) > 400;
  return countWords(cleaned) > 400;
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function countCjkDescriptionUnits(value: string): number {
  return Array.from(value).filter((char) => /[\u3400-\u9fffA-Za-z0-9]/u.test(char)).length;
}

function trimCjkDescriptionToLimit(value: string, limit: number): string {
  const cleaned = cleanupText(value);
  let units = 0;
  let output = "";
  for (const char of Array.from(cleaned)) {
    if (/[\u3400-\u9fffA-Za-z0-9]/u.test(char)) units += 1;
    if (units > limit) break;
    output += char;
  }
  return output.trim().replace(/[，,；;\s]+$/, "") + (output.trim().endsWith("。") ? "" : "。");
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
