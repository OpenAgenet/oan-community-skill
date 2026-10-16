import type {
  DiscoveryIndexResourceListResponse,
  RegistrarResourceListResponse,
  ResourcePackage,
} from "@openagenet/oan-sdk-ts/protocol-types";
import {
  assertDidOan,
  canonicalJson,
  type OanIdentityRecord,
} from "@openagenet/oan-sdk-ts";
import { createPrivateKey, sign, randomUUID } from "node:crypto";
import { loadIdentityStoreSnapshot } from "@openagenet/oan-sdk-ts/identity-store-node";
import { resolveRegistrarDid } from "./registrar.js";
import { OanHttpError } from "@openagenet/oan-sdk-ts/client";
import {
  createOanClient,
  createSkillFetch,
  type SkillClientFactoryOptions,
} from "./client-factory.js";
import { selectRegistrarEndpoint } from "./profiles.js";
import type { OanSkillProfile, SkillActionResult } from "./types.js";
import { stringInput, objectInput } from "./input.js";

/** Public Registrar projection; hashes on older records may lack the algorithm prefix. */
export interface PublicRegistrationRecord {
  resourceDid: string;
  resourceType?: string;
  packageVersion?: string;
  didDocumentHash?: string;
  metadataHash?: string;
  packageHash?: string;
  authorizedDomains?: string[];
  submittedAt?: string;
  rootStatus?: string;
}
export interface RegistrationCredentialStatus {
  issuerDid: string;
  credentialId: string | null;
  subjectDid: string;
  status: string;
  reason?: string;
  observedAt: string;
}
export interface RegistrationCredentialResult {
  resourceDid: string;
  controllerDid: string;
  registrationCredential: unknown;
}

export interface ResourceQueryInput {
  resourceDid: string;
  source?: "registrar" | "discovery";
}
export interface ResourceQueryOutput {
  resourceDid: string;
  source: "registrar" | "discovery";
  record?: PublicRegistrationRecord;
  package?: ResourcePackage | null;
}
export type ResourceListInput =
  | { source: "registrar"; afterDid?: string | null; limit?: number }
  | {
      source: "discovery";
      afterCursor?: number | null;
      afterResourceDid?: string | null;
      limit?: number;
    };
export interface RegistrationCredentialInput {
  resourceDid: string;
  identityDir?: string;
  controllerIdentityId?: string;
  controllerIdentity?: OanIdentityRecord;
}

/** Uses the node's controller-bound query protocol; no registration write or key upload. */
export async function registrationCredentialWithSkill(
  profile: OanSkillProfile,
  input: RegistrationCredentialInput,
  options: SkillClientFactoryOptions = {},
): Promise<SkillActionResult<RegistrationCredentialResult>> {
  try {
    objectInput(input, "input");
    stringInput(input.identityDir, "identityDir");
    stringInput(input.controllerIdentityId, "controllerIdentityId");
    assertDidOan(input.resourceDid);
    const snapshot = input.controllerIdentity
      ? undefined
      : await loadIdentityStoreSnapshot(input.identityDir);
    const identity =
      input.controllerIdentity ??
      [...snapshot!.subjects, ...snapshot!.agents].find(
        (r) => r.id === input.controllerIdentityId,
      );
    if (!identity) throw new Error("controller_identity_required");
    const registrarDid = await resolveRegistrarDid(profile, undefined, options);
    const path = `/resources/${encodeURIComponent(input.resourceDid)}/registration-credential`;
    const challenge = {
      method: "POST",
      path,
      resourceDid: input.resourceDid,
      controllerDid: identity.did,
      verificationMethod: identity.verificationMethodId,
      purpose: "registration-credential-query",
      requestTimestamp: new Date().toISOString(),
      requestNonce: randomUUID(),
      aud: registrarDid,
      protocolVersion: "oan-registration-credential-query-v1",
    };
    const signature = sign(
      null,
      Buffer.from(canonicalJson(challenge), "utf8"),
      createPrivateKey({ key: identity.privateKeyJwk, format: "jwk" }),
    );
    const proof = {
      type: "Ed25519Signature2020",
      created: challenge.requestTimestamp,
      proofPurpose: "capabilityInvocation",
      verificationMethod: identity.verificationMethodId,
      proofValue: `z${base58(signature)}`,
    };
    const body = {
      challenge,
      controllerDidDocument: identity.didDocument,
      proof,
    };
    const { assertPublicMaterial } = await import("./registration.js");
    assertPublicMaterial(body);
    const response = await createSkillFetch(profile, options.fetchImpl)(
      `${selectRegistrarEndpoint(profile)}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new OanHttpError(response.status, response.url, result);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

function base58(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex")}`),
    output = "";
  while (number > 0n) {
    output = alphabet[Number(number % 58n)] + output;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = "1" + output;
  }
  return output;
}

export async function queryResourceWithSkill(
  profile: OanSkillProfile,
  input: ResourceQueryInput,
  options: SkillClientFactoryOptions = {},
): Promise<SkillActionResult<ResourceQueryOutput>> {
  try {
    objectInput(input, "input");
    assertDidOan(input.resourceDid);
    const client = createOanClient(profile, options);
    const source = input.source ?? "discovery";
    if (source !== "registrar" && source !== "discovery")
      throw new Error("invalid_resource_query_source");
    const data: ResourceQueryOutput =
      source === "registrar"
        ? {
            resourceDid: input.resourceDid,
            source,
            record: (await client.getRegistrarResource(
              input.resourceDid,
            )) as PublicRegistrationRecord,
          }
        : { source, ...(await client.getDiscoveryResource(input.resourceDid)) };
    if (
      source === "registrar" &&
      data.record?.resourceDid !== input.resourceDid
    )
      throw new Error("invalid_registrar_record_response");
    if (data.resourceDid !== input.resourceDid)
      throw new Error("resource_response_did_mismatch");
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function listResourcesWithSkill(
  profile: OanSkillProfile,
  input: ResourceListInput,
  options: SkillClientFactoryOptions = {},
): Promise<
  SkillActionResult<
    RegistrarResourceListResponse | DiscoveryIndexResourceListResponse
  >
> {
  try {
    objectInput(input, "input");
    if (input.source !== "registrar" && input.source !== "discovery")
      throw new Error("invalid_resource_list_source");
    const limit = input.limit ?? 20;
    const cursorDid =
      input.source === "registrar" ? input.afterDid : input.afterResourceDid;
    if (cursorDid !== undefined && cursorDid !== null) {
      stringInput(cursorDid, "pagination DID", true);
      assertDidOan(cursorDid);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("page_limit_must_be_between_1_and_100");
    if (
      input.source === "discovery" &&
      input.afterCursor !== undefined &&
      input.afterCursor !== null &&
      (!Number.isSafeInteger(input.afterCursor) || input.afterCursor < 0)
    )
      throw new Error("invalid_discovery_cursor");
    const client = createOanClient(profile, options);
    const data =
      input.source === "registrar"
        ? await client.getRegistrarResourcesPage({ ...input, limit })
        : await client.getDiscoveryIndexResourcesPage({
            ...input,
            afterCursor: input.afterCursor ?? 0,
            limit,
          });
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function registrationCredentialStatusWithSkill(
  profile: OanSkillProfile,
  resourceDid: string,
  options: SkillClientFactoryOptions = {},
): Promise<SkillActionResult<RegistrationCredentialStatus>> {
  try {
    assertDidOan(resourceDid);
    const endpoint = selectRegistrarEndpoint(profile);
    if (!endpoint) throw new Error("missing_registrar_endpoint");
    const response = await createSkillFetch(
      profile,
      options.fetchImpl,
    )(`${endpoint}/resources/${encodeURIComponent(resourceDid)}/status`);
    const body = await response.json();
    if (!response.ok)
      throw new OanHttpError(response.status, response.url, body);
    return { ok: true, data: body };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): SkillActionResult<never> {
  return {
    ok: false,
    errorCategory:
      error instanceof OanHttpError && error.status === 404
        ? "resource not found"
        : "query error",
    errorMessage:
      error instanceof OanHttpError
        ? `${error.message}: ${JSON.stringify(error.body)}`
        : error instanceof Error
          ? error.message
          : String(error),
    suggestedNextActions: [
      ...(error instanceof OanHttpError && error.status === 403
        ? [
            "VC retrieval requires the registered controller's local identity and a stored Registrar access binding. Preserve the original registration receipt; older/self-controlled records may not allow retrieval.",
          ]
        : []),
      "Check the selected node, resource DID, and pagination cursor. A resource absent from Discovery may still be registered.",
    ],
  };
}
