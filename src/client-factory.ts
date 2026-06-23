// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanClient } from "../../oan-sdk-ts/packages/client-ts/src/index.js";
import { GovernanceClient } from "../../oan-sdk-ts/packages/governance-ts/src/index.js";
import type { OanSkillProfile } from "./types.js";
import { selectDiscoveryEndpoint, selectRegistrarEndpoint } from "./profiles.js";

export interface SkillClientFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createOanClient(profile: OanSkillProfile, options: SkillClientFactoryOptions = {}): OanClient {
  return new OanClient({
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
