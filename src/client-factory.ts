// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { OanClient, OanHttpError } from "@openagenet/oan-sdk-ts/client";
import { GovernanceClient } from "@openagenet/oan-sdk-ts/governance";
import type { OanSkillProfile } from "./types.js";
import {
  selectBaseUrl,
  selectDiscoveryEndpoint,
  selectRegistrarEndpoint,
  validateEndpoint,
} from "./profiles.js";

export interface SkillClientFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createOanClient(
  profile: OanSkillProfile,
  options: SkillClientFactoryOptions = {},
): OanClient {
  return new OanClient({
    baseUrl: selectBaseUrl(profile),
    registrarEndpoint: selectRegistrarEndpoint(profile) ?? "",
    discoveryEndpoint: selectDiscoveryEndpoint(profile) ?? "",
    rootEndpoint: profile.allowDirectRootInspection
      ? profile.rootReferenceEndpoint
        ? validateEndpoint(profile.rootReferenceEndpoint)
        : (selectBaseUrl(profile) ?? "")
      : "",
    cdnEndpoint: profile.allowDirectCdnInspection
      ? profile.cdnReferenceEndpoint
        ? validateEndpoint(profile.cdnReferenceEndpoint)
        : (selectBaseUrl(profile) ?? "")
      : "",
    fetchImpl: createSkillFetch(profile, options.fetchImpl),
  });
}

/** Bound every request. Retry only reads; never replay registration or signed writes. */
export function createSkillFetch(
  profile: OanSkillProfile,
  fetchImpl = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url,
    );
    if (
      (!profile.allowDirectRootInspection &&
        url.pathname.startsWith("/root/")) ||
      (!profile.allowDirectCdnInspection && url.pathname.startsWith("/cdn/"))
    ) {
      throw new Error("direct_inspection_disabled");
    }
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const read =
      (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase() === "GET";
    const attempts = read
      ? Math.min(5, Math.max(1, profile.retryPolicy?.maxAttempts ?? 1))
      : 1;
    for (let attempt = 1; ; attempt++) {
      const timeout = AbortSignal.timeout(profile.requestTimeoutMs ?? 15_000);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, timeout])
        : timeout;
      try {
        const response = await fetchImpl(input, { ...init, signal });
        if (
          !read ||
          ![429, 502, 503, 504].includes(response.status) ||
          attempt >= attempts
        ) {
          if (
            !response.ok &&
            !response.headers.get("content-type")?.includes("json")
          ) {
            const detail = (await response.text()).slice(0, 1000);
            throw new OanHttpError(response.status, url.toString(), {
              message: detail || response.statusText,
            });
          }
          return response;
        }
        await response.body?.cancel();
      } catch (error) {
        if (
          error instanceof OanHttpError ||
          !read ||
          attempt >= attempts ||
          callerSignal?.aborted
        )
          throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, profile.retryPolicy?.delayMs ?? 500),
      );
    }
  }) as typeof fetch;
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
