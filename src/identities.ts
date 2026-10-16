import { resolve } from "node:path";
import {
  getDefaultIdentityStoreDir,
  loadIdentityStoreSnapshot,
} from "@openagenet/oan-sdk-ts/identity-store-node";
import type { SkillActionResult } from "./types.js";
import { objectInput, stringInput } from "./input.js";

export async function listLocalIdentities(
  input: { identityDir?: string } = {},
): Promise<
  SkillActionResult<{
    identityDir: string;
    items: Array<{
      id: string;
      did: string;
      kind: string;
      label: string;
      resourceType: string;
      controllerDid: string;
    }>;
  }>
> {
  try {
    objectInput(input, "input");
    stringInput(input.identityDir, "identityDir");
    const identityDir = resolve(
      input.identityDir ?? getDefaultIdentityStoreDir(),
    );
    const snapshot = await loadIdentityStoreSnapshot(identityDir);
    return {
      ok: true,
      data: {
        identityDir,
        items: [...snapshot.subjects, ...snapshot.agents].map((record) => ({
          id: record.id,
          did: record.did,
          kind: record.kind,
          label: record.profile.label,
          resourceType: record.profile.resourceType,
          controllerDid: record.profile.ownerSubjectDid ?? record.did,
        })),
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory: "local identity error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
