// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanClient } from "@openagenet/oan-sdk-ts/client";
import { GovernanceClient } from "@openagenet/oan-sdk-ts/governance";
import type { OanSkillProfile } from "./types.js";
import { selectBaseUrl, selectDiscoveryEndpoint, selectRegistrarEndpoint } from "./profiles.js";

export interface SkillClientFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createOanClient(profile: OanSkillProfile, options: SkillClientFactoryOptions = {}): OanClient {
  return new OanClient({
    baseUrl: selectBaseUrl(profile),
    registrarEndpoint: selectRegistrarEndpoint(profile),
    discoveryEndpoint: selectDiscoveryEndpoint(profile),
    rootEndpoint: profile.rootReferenceEndpoint,
    cdnEndpoint: profile.cdnReferenceEndpoint,
    fetchImpl: options.fetchImpl,
  });
}

export function createGovernanceClient(
  profile: OanSkillProfile,
  options: SkillClientFactoryOptions = {},
): GovernanceClient {
  return new GovernanceClient({
    trustIndexerEndpoint: profile.trustIndexerEndpoint,
    fetchImpl: options.fetchImpl,
  });
}
