import { assertDidOan } from "@openagenet/oan-sdk-ts";
import {
  createOanClient,
  type SkillClientFactoryOptions,
} from "./client-factory.js";
import type { OanSkillProfile } from "./types.js";

/** Resolve from the selected Registrar, never from a sample or a different node. */
export async function resolveRegistrarDid(
  profile: OanSkillProfile,
  explicit?: string,
  options: SkillClientFactoryOptions = {},
): Promise<string> {
  const status = await createOanClient(profile, options).getRegistrarStatus();
  const did = status.registrarDid ?? status.did;
  if (!did) throw new Error("registrar_did_missing_from_status");
  assertDidOan(did);
  const expected = explicit ?? profile.registrarDid;
  if (expected && expected !== did)
    throw new Error("registrar_did_endpoint_mismatch");
  return did;
}
