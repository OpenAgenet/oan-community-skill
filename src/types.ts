// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type {
  GovernanceDecision,
} from "../../oan-sdk-ts/packages/governance-ts/src/index.js";
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
} from "../../oan-sdk-ts/packages/protocol-types/src/index.js";
import type { OanIdentityRecord } from "../../oan-sdk-ts/packages/sdk-ts/src/identity.js";

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
  officialRegistrarEndpoints?: string[];
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
}

export interface RegistrationSkillInput {
  submission?: ResourceRegistrationSubmission;
  identityDir?: string;
  subjectIdentityId?: string;
  agentIdentityId?: string;
  createSubjectIfMissing?: boolean;
  generateIdentity?: {
    subjectLabel?: string;
    resourceLabel: string;
    resourceType: Extract<ResourceType, "agent_service" | "skill" | "mcp_server" | "tool_api">;
    description?: string;
    capabilityTags?: string[];
    authorizedDomains?: string[];
    endpoint?: string;
    manifestUrl?: string;
    schemaUrl?: string;
  };
}

export interface RegistrationSkillOutput {
  registration: ResourceRegistrationResponse;
  lifecycle: Omit<OanLifecycleSnapshot, "cdnPackage">;
  subjectIdentity?: Pick<OanIdentityRecord, "id" | "did" | "profile">;
  agentIdentity?: Pick<OanIdentityRecord, "id" | "did" | "profile">;
}

export interface DiscoverySkillInput {
  query: ResourceDiscoveryQuery;
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
  agentIdentityId?: string;
  sourceName?: string;
  sourceUrl?: string;
  overrides?: Partial<ResourceDescriptionRegistrationCandidate>;
}

export interface ResourceDescriptionDraftOutput {
  candidate: ResourceDescriptionRegistrationCandidate;
  submission?: ResourceRegistrationSubmission;
  missingInputs?: string[];
  qualityIssues?: string[];
}

export interface ResourceDescriptionRegistrationOutput {
  candidate: ResourceDescriptionRegistrationCandidate;
  registration?: RegistrationSkillOutput["registration"];
  lifecycle?: RegistrationSkillOutput["lifecycle"];
  subjectIdentity?: RegistrationSkillOutput["subjectIdentity"];
  agentIdentity?: RegistrationSkillOutput["agentIdentity"];
  missingInputs?: string[];
  qualityIssues?: string[];
}

export interface ResourceDescriptionBatchItem {
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
  stopOnFailure?: boolean;
}

export interface ResourceDescriptionBatchItemResult {
  id: string;
  sourcePath?: string;
  status: "registered" | "skipped" | "failed";
  stage?: OanWorkflowStage;
  resourceDid?: string;
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
