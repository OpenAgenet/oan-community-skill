// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanHttpError } from "../../oan-sdk-ts/packages/client-ts/src/index.js";
import { createOanClient } from "./client-factory.js";
import type {
  DiscoverySkillInput,
  DiscoverySkillOutput,
  OanSkillProfile,
  SkillActionResult,
} from "./types.js";

export async function discoverResourcesWithSkill(
  profile: OanSkillProfile,
  input: DiscoverySkillInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<DiscoverySkillOutput>> {
  const client = createOanClient(profile, options);
  try {
    const normalizedQuery = {
      ...input.query,
      ...(profile.preferredDomain && !input.query.capabilityTags?.includes(profile.preferredDomain)
        ? {
            capabilityTags: [...(input.query.capabilityTags ?? []), profile.preferredDomain],
          }
        : {}),
    };
    const [response, explanation] = await Promise.all([
      client.discoverResources(normalizedQuery),
      client.explainDiscoveryQuery(normalizedQuery).catch(() => undefined),
    ]);
    return {
      ok: true,
      stage: "visible-in-discovery",
      data: { response, explanation },
      suggestedNextActions:
        response.candidates.length > 0
          ? ["Use the returned candidates to continue trust verification or invocation planning."]
          : ["Broaden the query, switch domains, or inspect Discovery authorization scope."],
    };
  } catch (error) {
    if (error instanceof OanHttpError) {
      return {
        ok: false,
        errorCategory: "endpoint error",
        errorMessage: JSON.stringify(error.body),
        suggestedNextActions: ["Inspect the Discovery response and profile settings."],
      };
    }
    return {
      ok: false,
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Check Discovery endpoint configuration."],
    };
  }
}
