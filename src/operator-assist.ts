// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { createOanClient } from "./client-factory.js";
import type {
  OanSkillProfile,
  OperatorAssistInput,
  OperatorAssistOutput,
  SkillActionResult,
} from "./types.js";

export async function operatorAssistWithSkill(
  profile: OanSkillProfile,
  input: OperatorAssistInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillActionResult<OperatorAssistOutput>> {
  try {
    const client = createOanClient(profile, options);
    const [registrarStatus, discoveryStatus] = await Promise.allSettled([
      client.getRegistrarStatus(),
      client.getDiscoveryStatus(),
    ]);

    const registrarReachable = registrarStatus.status === "fulfilled";
    const discoveryReachable = discoveryStatus.status === "fulfilled";

    const [registrarRootAuthorization, discoveryRootAuthorization, discoveryAuthorizedDomains] = await Promise.all([
      client.getRegistrarRootAuthorization().catch(() => undefined),
      client.getDiscoveryRootAuthorization().catch(() => undefined),
      client.getDiscoveryAuthorizedDomains().catch(() => undefined),
    ]);

    const lifecycle = input.resourceDid ? await client.observeLifecycle(input.resourceDid) : undefined;
    return {
      ok: true,
      stage: lifecycle?.stage,
      data: {
        registrarReachable,
        discoveryReachable,
        registrarRootAuthorization,
        discoveryRootAuthorization,
        discoveryAuthorizedDomains,
        lifecycle,
      },
      suggestedNextActions: [
        registrarReachable ? "Registrar is reachable." : "Registrar endpoint should be checked.",
        discoveryReachable ? "Discovery is reachable." : "Discovery endpoint should be checked.",
        ...(discoveryAuthorizedDomains?.authorizedDomains?.length
          ? [`Discovery authorized domains: ${discoveryAuthorizedDomains.authorizedDomains.join(", ")}`]
          : []),
        ...(lifecycle?.observations ?? []),
      ],
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "operator-only endpoint unavailable",
      errorMessage: error instanceof Error ? error.message : String(error),
      suggestedNextActions: ["Check profile endpoints and corresponding service health/status APIs."],
    };
  }
}
