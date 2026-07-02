// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { createOanClient } from "./client-factory.js";
import type {
  CapabilityAssistInput,
  CapabilityAssistOutput,
  DiscoveryQueryAssistInput,
  DiscoveryQueryAssistOutput,
  OanSkillProfile,
  RegistrationMetadataAssistInput,
  RegistrationMetadataAssistOutput,
  SkillActionResult,
} from "./types.js";

export async function suggestCapabilityTagsWithSkill(
  profile: OanSkillProfile,
  input: CapabilityAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<CapabilityAssistOutput>> {
  try {
    const client = createOanClient(profile, options);
    const [suggestions, normalized] = await Promise.all([
      client.suggestCapabilityTags({
        description: input.description,
        query: input.query,
      }),
      input.tags?.length ? client.normalizeCapabilityTags(input.tags) : Promise.resolve(undefined),
    ]);
    return {
      ok: true,
      data: { suggestions, normalized },
      suggestedNextActions: [
        "Use suggested or normalized capability tags to refine oanMetadata.capabilityTags before registration.",
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

export async function suggestRegistrationMetadataWithSkill(
  profile: OanSkillProfile,
  input: RegistrationMetadataAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<RegistrationMetadataAssistOutput>> {
  try {
    const client = createOanClient(profile, options);
    const [suggestions, domainCatalog] = await Promise.all([
      client.suggestRegistrationMetadata(input),
      client.getRegistrationDomainCatalog().catch(() => undefined),
    ]);
    return {
      ok: true,
      data: { suggestions, domainCatalog },
      suggestedNextActions: [
        "Review the suggested authorized domains and capability tags before final registration.",
        "Keep authorized domains within the Registrar domain catalog; capability tags remain editable search hints.",
      ],
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: [
        "Check Registrar endpoint configuration, then continue with manually selected domains and tags if needed.",
      ],
    };
  }
}

export async function suggestDiscoveryQueryWithSkill(
  profile: OanSkillProfile,
  input: DiscoveryQueryAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<DiscoveryQueryAssistOutput>> {
  try {
    const client = createOanClient(profile, options);
    const suggestions = await client.suggestDiscoveryQuery(input);
    return {
      ok: true,
      data: { suggestions },
      suggestedNextActions: [
        "Use the suggested filters to improve Discovery recall and precision, then adjust them for the user intent.",
      ],
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Check Discovery endpoint configuration or continue with a plain text query."],
    };
  }
}
