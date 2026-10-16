// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanHttpError } from "@openagenet/oan-sdk-ts/client";
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
  try {
    const client = createOanClient(profile, options);
    // Authorization domains are not capability tags or protocol query filters.
    const normalizedQuery = { ...input.query, limit: input.query.limit ?? 10 };
    if (
      !Number.isInteger(normalizedQuery.limit) ||
      normalizedQuery.limit < 1 ||
      normalizedQuery.limit > 100
    ) {
      throw new Error("discovery_limit_must_be_between_1_and_100");
    }
    const [response, explanation] = await Promise.all([
      client.discoverResources(normalizedQuery),
      input.includeExplanation === false
        ? undefined
        : client.explainDiscoveryQuery(normalizedQuery).catch(() => undefined),
    ]);
    return {
      ok: true,
      data: { response, explanation },
      suggestedNextActions:
        response.candidates.length > 0
          ? [
              "Use the returned candidates to continue trust verification or invocation planning.",
            ]
          : [
              "Broaden the query, switch domains, or inspect Discovery authorization scope.",
            ],
    };
  } catch (error) {
    if (error instanceof OanHttpError) {
      return {
        ok: false,
        errorCategory: "endpoint error",
        errorMessage: JSON.stringify(error.body),
        suggestedNextActions: [
          "Inspect the Discovery response and profile settings.",
        ],
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
