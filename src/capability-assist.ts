// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { createOanClient } from "./client-factory.js";
import type {
  CapabilityAssistInput,
  CapabilityAssistOutput,
  OanSkillProfile,
  SkillActionResult,
} from "./types.js";

export async function suggestCapabilityTagsWithSkill(
  profile: OanSkillProfile,
  input: CapabilityAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<CapabilityAssistOutput>> {
  try {
    const client = createOanClient(profile, options);
    const suggestions = await client.suggestCapabilityTags({
      description: input.description,
      query: input.query,
    });
    return {
      ok: true,
      data: { suggestions },
      suggestedNextActions: [
        "Use the suggested capability tags to refine oanMetadata.capabilityTags before registration.",
      ],
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Check Registrar endpoint configuration or provide tags manually."],
    };
  }
}
