// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type {
  GovernanceDecision,
} from "@openagenet/oan-sdk-ts/governance";
import type {
  ResourceType,
  CapabilityTagNormalizeResponse,
  CapabilityTagSuggestionResponse,
  DiscoverySuggestionInput,
  DiscoverySuggestionResult,
  DiscoveryAuthorizedDomainsResponse,
  OanLifecycleSnapshot,
  OanWorkflowStage,
  RegistrationDomainCatalogResponse,
  RegistrationSuggestionInput,
  RegistrationSuggestionResult,
  ResourceDiscoveryExplainResponse,
  ResourceDiscoveryQuery,
  ResourceDiscoveryResponse,
  ResourceRegistrationResponse,
  ResourceRegistrationSubmission,
  RootAuthorizationInspection,
} from "@openagenet/oan-sdk-ts/protocol-types";
import type { OanIdentityRecord } from "@openagenet/oan-sdk-ts";

export type NodeSelectionMode =
  | "official-only"
  | "official-preferred"
  | "custom-only"
  | "custom-preferred";

export type VerificationPolicy = "strict" | "balanced" | "development";

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
}

export interface OanSkillProfile {
  nodeSelectionMode: NodeSelectionMode;
  baseUrl?: string;
  registrarEndpoint?: string;
  discoveryEndpoint?: string;
  officialRegistrarEndpoints?: string[];
  registrarDid?: string;
  officialDiscoveryEndpoints?: string[];
  customRegistrarEndpoints?: string[];
  customDiscoveryEndpoints?: string[];
  rootReferenceEndpoint?: string;
  cdnReferenceEndpoint?: string;
  trustIndexerEndpoint?: string;
  requestTimeoutMs?: number;
  retryPolicy?: RetryPolicy;
  verificationPolicy?: VerificationPolicy;
  preferredDomain?: string;
  allowDirectRootInspection?: boolean;
  allowDirectCdnInspection?: boolean;
  allowGovernanceStateReads?: boolean;
}

export interface SkillActionResult<T = unknown> {
  ok: boolean;
  stage?: OanWorkflowStage;
  data?: T;
  missingInputs?: string[];
  verificationFindings?: string[];
  suggestedNextActions?: string[];
  errorCategory?: string;
  errorMessage?: string;
  localIdentity?: { id: string; did: string };
  identityDir?: string;
}

export interface RegistrationSkillInput {
  submission?: ResourceRegistrationSubmission;
  registrarDid?: string;
  identityDir?: string;
  subjectIdentityId?: string;
  agentIdentityId?: string;
  /** Local record of an already registered controller (subject or resource). */
  controllerIdentityId?: string;
  /** Use for re-signing a prepared submission after changing metadata. Never transmitted. */
  resourceIdentity?: OanIdentityRecord;
  controllerIdentity?: OanIdentityRecord;
  createSubjectIfMissing?: boolean;
  generateIdentity?: {
    subjectLabel?: string;
    resourceLabel: string;
    resourceType: Extract<ResourceType, "agent_service" | "skill" | "mcp_server" | "tool_api" | "controller">;
    description?: string;
    capabilityTags?: string[];
    authorizedDomains?: string[];
    endpoint?: string;
    manifestUrl?: string;
    schemaUrl?: string;
    packageVersion?: string;
    protocol?: string;
  };
}

export interface RegistrationSkillOutput {
  files?: RegistrationFiles;
  fileSaveError?: string;
  registration: ResourceRegistrationResponse;
  lifecycle: Omit<OanLifecycleSnapshot, "cdnPackage">;
  subjectIdentity?: Pick<OanIdentityRecord, "id" | "did" | "profile">;
  agentIdentity?: Pick<OanIdentityRecord, "id" | "did" | "profile">;
}

export interface RegistrationFiles {
  directory: string;
  didDocument: string;
  receipt: string;
  registrationVc?: string;
  oanIdentity?: string;
}

export interface DiscoverySkillInput {
  query: ResourceDiscoveryQuery;
  includeExplanation?: boolean;
}

export interface DiscoverySkillOutput {
  response: ResourceDiscoveryResponse;
  explanation?: ResourceDiscoveryExplainResponse;
}

export interface ValidationSkillInput {
  submission?: ResourceRegistrationSubmission;
}

export interface ValidationSkillOutput {
  normalizedResourceDid: string;
  resourceType: string;
  findings: string[];
}

export interface LifecycleSkillInput {
  resourceDid: string;
}

export interface LifecycleSkillOutput {
  snapshot: OanLifecycleSnapshot;
}

export interface GovernanceAssistInput {
  subjectRole: "registrar" | "discovery" | "vc_issuer";
  subjectDid: string;
}

export interface GovernanceAssistOutput {
  decision: GovernanceDecision;
}

export interface OperatorAssistInput {
  resourceDid?: string;
}

export interface OperatorAssistOutput {
  registrarReachable?: boolean;
  discoveryReachable?: boolean;
  registrarRootAuthorization?: RootAuthorizationInspection;
  discoveryRootAuthorization?: RootAuthorizationInspection;
  discoveryAuthorizedDomains?: DiscoveryAuthorizedDomainsResponse;
  lifecycle?: OanLifecycleSnapshot;
}

export interface CapabilityAssistInput {
  description?: string;
  query?: string;
  tags?: string[];
}

export interface CapabilityAssistOutput {
  suggestions: CapabilityTagSuggestionResponse;
  normalized?: CapabilityTagNormalizeResponse;
}

export interface RegistrationMetadataAssistInput extends RegistrationSuggestionInput {}

export interface RegistrationMetadataAssistOutput {
  suggestions: RegistrationSuggestionResult;
  domainCatalog?: RegistrationDomainCatalogResponse;
}

export interface DiscoveryQueryAssistInput extends DiscoverySuggestionInput {}

export interface DiscoveryQueryAssistOutput {
  suggestions: DiscoverySuggestionResult;
}

export type CommunityRegistrableResourceType = Extract<
  ResourceType,
  "agent_service" | "skill" | "mcp_server" | "tool_api"
>;

export interface ResourceDescriptionRegistrationCandidate {
  sourceName?: string;
  sourceUrl?: string;
  resourceType: CommunityRegistrableResourceType;
  name: string;
  description: string;
  capabilityDescription?: string;
  version: string;
  endpoint?: string;
  protocol?: string;
  manifestUrl?: string;
  schemaUrl?: string;
  downloadUrl?: string;
  repositoryUrl?: string;
  packageUrl?: string;
  authorizedDomains: string[];
  capabilityTags: string[];
  useCases: string[];
  inputs: string[];
  outputs: string[];
  license?: string;
  maintainer?: string;
}

export interface ResourceDescriptionRegistrationInput {
  markdown?: string;
  text?: string;
  identityDir?: string;
  subjectLabel?: string;
  subjectIdentityId?: string;
  controllerIdentityId?: string;
  agentIdentityId?: string;
  registrarDid?: string;
  reuseAgentIdentity?: boolean;
  sourceName?: string;
  sourceUrl?: string;
  overrides?: Partial<ResourceDescriptionRegistrationCandidate>;
}

export interface ResourceDescriptionDraftOutput {
  candidate: ResourceDescriptionRegistrationCandidate;
  submission?: ResourceRegistrationSubmission;
  agentIdentity?: RegistrationSkillOutput["agentIdentity"];
  identityDir?: string;
  missingInputs?: string[];
  qualityIssues?: string[];
}

export interface ResourceDescriptionRegistrationOutput {
  files?: RegistrationFiles;
  fileSaveError?: string;
  candidate: ResourceDescriptionRegistrationCandidate;
  registration?: RegistrationSkillOutput["registration"];
  lifecycle?: RegistrationSkillOutput["lifecycle"];
  subjectIdentity?: RegistrationSkillOutput["subjectIdentity"];
  agentIdentity?: RegistrationSkillOutput["agentIdentity"];
  missingInputs?: string[];
  qualityIssues?: string[];
}

export interface ResourceDescriptionBatchItem {
  /** File read failure supplied by CLI collectors; never submitted. */
  sourceReadError?: string;
  id?: string;
  sourcePath?: string;
  markdown?: string;
  text?: string;
  sourceName?: string;
  sourceUrl?: string;
  overrides?: Partial<ResourceDescriptionRegistrationCandidate>;
}

export interface ResourceDescriptionBatchRegistrationInput {
  items: ResourceDescriptionBatchItem[];
  identityDir?: string;
  subjectLabel?: string;
  controllerIdentityId?: string;
  registrarDid?: string;
  stopOnFailure?: boolean;
}

export interface ResourceDescriptionBatchItemResult {
  files?: RegistrationFiles;
  fileSaveError?: string;
  id: string;
  sourcePath?: string;
  status: "registered" | "skipped" | "failed";
  stage?: OanWorkflowStage;
  resourceDid?: string;
  registration?: ResourceRegistrationResponse;
  agentIdentity?: RegistrationSkillOutput["agentIdentity"];
  candidate?: ResourceDescriptionRegistrationCandidate;
  missingInputs?: string[];
  qualityIssues?: string[];
  errorCategory?: string;
  errorMessage?: string;
  suggestedNextActions?: string[];
}

export interface ResourceDescriptionBatchRegistrationOutput {
  summary: {
    total: number;
    registered: number;
    skipped: number;
    failed: number;
  };
  results: ResourceDescriptionBatchItemResult[];
}
