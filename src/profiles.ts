// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type { OanSkillProfile } from "./types.js";
import { DEFAULT_OAN_OFFICIAL_ENDPOINTS } from "@openagenet/oan-sdk-ts/client";

export const DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS = {
  baseUrl: "https://www.openagenet.xyz",
  registrarEndpoint: DEFAULT_OAN_OFFICIAL_ENDPOINTS.registrarEndpoint,
  discoveryEndpoint: DEFAULT_OAN_OFFICIAL_ENDPOINTS.discoveryEndpoint,
  rootEndpoint: DEFAULT_OAN_OFFICIAL_ENDPOINTS.rootEndpoint,
  cdnEndpoint: DEFAULT_OAN_OFFICIAL_ENDPOINTS.cdnEndpoint,
  trustIndexerEndpoint: DEFAULT_OAN_OFFICIAL_ENDPOINTS.trustIndexerEndpoint,
};

export function createDefaultProfile(
  overrides: Partial<OanSkillProfile> = {},
): OanSkillProfile {
  if (
    overrides.requestTimeoutMs !== undefined &&
    (!Number.isSafeInteger(overrides.requestTimeoutMs) ||
      overrides.requestTimeoutMs < 1)
  ) {
    throw new Error("invalid_request_timeout");
  }
  if (
    overrides.retryPolicy &&
    (!Number.isSafeInteger(overrides.retryPolicy.maxAttempts) ||
      overrides.retryPolicy.maxAttempts < 1 ||
      !Number.isSafeInteger(overrides.retryPolicy.delayMs) ||
      overrides.retryPolicy.delayMs < 0)
  ) {
    throw new Error("invalid_retry_policy");
  }
  const customOnly = overrides.nodeSelectionMode === "custom-only";
  return {
    nodeSelectionMode: "official-preferred",
    baseUrl: customOnly
      ? undefined
      : DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl,
    officialRegistrarEndpoints: [],
    officialDiscoveryEndpoints: [],
    customRegistrarEndpoints: [],
    customDiscoveryEndpoints: [],
    rootReferenceEndpoint: undefined,
    cdnReferenceEndpoint: undefined,
    requestTimeoutMs: 15_000,
    retryPolicy: { maxAttempts: 2, delayMs: 500 },
    verificationPolicy: "balanced",
    allowDirectRootInspection: !customOnly || !!overrides.rootReferenceEndpoint,
    allowDirectCdnInspection: !customOnly || !!overrides.cdnReferenceEndpoint,
    allowGovernanceStateReads: false,
    ...overrides,
  };
}

export function selectRegistrarEndpoint(
  profile: OanSkillProfile,
): string | undefined {
  if (profile.registrarEndpoint)
    return validateEndpoint(profile.registrarEndpoint);
  const list = orderedEndpoints(
    profile.nodeSelectionMode,
    profile.officialRegistrarEndpoints?.length
      ? profile.officialRegistrarEndpoints
      : [DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl],
    profile.customRegistrarEndpoints ?? [],
  );
  const value =
    profile.baseUrl &&
    !profile.customRegistrarEndpoints?.length &&
    !profile.officialRegistrarEndpoints?.length
      ? profile.baseUrl
      : list[0];
  return value ? validateEndpoint(value) : undefined;
}

export function selectBaseUrl(profile: OanSkillProfile): string | undefined {
  return profile.baseUrl ? validateEndpoint(profile.baseUrl) : undefined;
}

export function selectDiscoveryEndpoint(
  profile: OanSkillProfile,
): string | undefined {
  if (profile.discoveryEndpoint)
    return validateEndpoint(profile.discoveryEndpoint);
  const list = orderedEndpoints(
    profile.nodeSelectionMode,
    profile.officialDiscoveryEndpoints?.length
      ? profile.officialDiscoveryEndpoints
      : [DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl],
    profile.customDiscoveryEndpoints ?? [],
  );
  const value =
    profile.baseUrl &&
    !profile.customDiscoveryEndpoints?.length &&
    !profile.officialDiscoveryEndpoints?.length
      ? profile.baseUrl
      : list[0];
  return value ? validateEndpoint(value) : undefined;
}

export function validateEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid_oan_endpoint");
  }
  return endpoint.trim().replace(/\/+$/, "");
}

function orderedEndpoints(
  mode: OanSkillProfile["nodeSelectionMode"],
  official: string[],
  custom: string[],
): string[] {
  if (mode === "official-only") return official.filter(Boolean);
  if (mode === "custom-only") return custom.filter(Boolean);
  if (mode === "custom-preferred")
    return [...custom, ...official].filter(Boolean);
  return [...official, ...custom].filter(Boolean);
}
