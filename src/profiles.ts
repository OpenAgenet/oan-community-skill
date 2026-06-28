// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type { OanSkillProfile } from "./types.js";

export function createDefaultProfile(overrides: Partial<OanSkillProfile> = {}): OanSkillProfile {
  return {
    nodeSelectionMode: "official-preferred",
    officialRegistrarEndpoints: [],
    officialDiscoveryEndpoints: [],
    customRegistrarEndpoints: [],
    customDiscoveryEndpoints: [],
    requestTimeoutMs: 15_000,
    retryPolicy: { maxAttempts: 2, delayMs: 500 },
    verificationPolicy: "balanced",
    allowDirectRootInspection: true,
    allowDirectCdnInspection: true,
    allowGovernanceStateReads: false,
    ...overrides,
  };
}

export function selectRegistrarEndpoint(profile: OanSkillProfile): string {
  const list = orderedEndpoints(
    profile.nodeSelectionMode,
    profile.officialRegistrarEndpoints ?? [],
    profile.customRegistrarEndpoints ?? [],
  );
  const value = list[0];
  if (!value) throw new Error("missing_registrar_endpoint");
  return value;
}

export function selectDiscoveryEndpoint(profile: OanSkillProfile): string {
  const list = orderedEndpoints(
    profile.nodeSelectionMode,
    profile.officialDiscoveryEndpoints ?? [],
    profile.customDiscoveryEndpoints ?? [],
  );
  const value = list[0];
  if (!value) throw new Error("missing_discovery_endpoint");
  return value;
}

function orderedEndpoints(
  mode: OanSkillProfile["nodeSelectionMode"],
  official: string[],
  custom: string[],
): string[] {
  if (mode === "official-only") return official.filter(Boolean);
  if (mode === "custom-only") return custom.filter(Boolean);
  if (mode === "custom-preferred") return [...custom, ...official].filter(Boolean);
  return [...official, ...custom].filter(Boolean);
}
