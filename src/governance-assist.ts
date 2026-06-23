// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { subjectTypeCodeForRole } from "../../oan-sdk-ts/packages/governance-ts/src/index.js";
import { createGovernanceClient } from "./client-factory.js";
import type {
  GovernanceAssistInput,
  GovernanceAssistOutput,
  OanSkillProfile,
  SkillActionResult,
} from "./types.js";

export async function governanceAssistWithSkill(
  profile: OanSkillProfile,
  input: GovernanceAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<GovernanceAssistOutput>> {
  if (!profile.allowGovernanceStateReads) {
    return {
      ok: false,
      errorCategory: "configuration error",
      errorMessage: "Governance-state reads are disabled by profile.",
      suggestedNextActions: ["Enable governance-state reads or provide a trustIndexerEndpoint."],
    };
  }
  const subjectType = subjectTypeCodeForRole(input.subjectRole);
  if (!subjectType) {
    return {
      ok: false,
      errorCategory: "input error",
      errorMessage: `Unsupported subject role: ${input.subjectRole}`,
    };
  }
  try {
    const client = createGovernanceClient(profile, options);
    const decision = await client.getGovernanceDecision(subjectType, input.subjectDid);
    return {
      ok: true,
      data: { decision },
      suggestedNextActions: decision.authorized
        ? [
            "Governance-visible state is active.",
            "If this is an infrastructure node workflow, also check Root-facing operational authorization before treating the node as fully usable.",
            "For Discovery nodes, also inspect authorized domains before assuming a resource should be visible there.",
          ]
        : ["Governance-visible state is not active; inspect reason and governance history."],
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "governance-state uncertainty",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Check trust-indexer availability and governance subject identifiers."],
    };
  }
}
