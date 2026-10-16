// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { createOanClient } from "./client-factory.js";
import { assertDidOan } from "@openagenet/oan-sdk-ts";
import type {
  LifecycleSkillInput,
  LifecycleSkillOutput,
  OanSkillProfile,
  SkillActionResult,
} from "./types.js";

export async function inspectLifecycleWithSkill(
  profile: OanSkillProfile,
  input: LifecycleSkillInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<LifecycleSkillOutput>> {
  try {
    assertDidOan(input.resourceDid);
    const client = createOanClient(profile, options);
    const snapshot = await client.observeLifecycle(input.resourceDid);
    if (!snapshot.registrarStatus && !snapshot.discoveryStatus && !snapshot.registrarAccepted && !snapshot.rootObserved && !snapshot.cdnObserved && !snapshot.discoveryVisible) {
      throw new Error("No selected OAN service returned an observation; check node configuration and reachability.");
    }
    snapshot.observations = [...(snapshot.observations ?? []), "Observation is best effort: an unavailable service or missing record does not prove failed registration."];
    return {
      ok: true,
      stage: snapshot.stage,
      data: { snapshot },
      suggestedNextActions: nextActions(snapshot.stage),
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "endpoint error",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Verify profile endpoints and inspect service health/status APIs."],
    };
  }
}

function nextActions(stage: string): string[] {
  if (stage === "visible-in-discovery") return ["Resource is visible in Discovery."];
  if (stage === "published-to-cdn") return ["Wait for or trigger follow-up Discovery visibility checks."];
  if (stage === "accepted-by-root") return ["Wait for CDN publication progress."];
  if (stage === "accepted-by-registrar") return ["Wait for Root acceptance and publication progression."];
  return ["Re-check lifecycle state after a short delay."];
}
