// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type {
  GovernanceDecision,
} from "../../oan-sdk-ts/packages/governance-ts/src/index.js";
import type {
  ResourceType,
  CapabilityTagSuggestionResponse,
  DiscoveryAuthorizedDomainsResponse,
  OanLifecycleSnapshot,
  OanWorkflowStage,
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
}

export interface CapabilityAssistOutput {
  suggestions: CapabilityTagSuggestionResponse;
}
