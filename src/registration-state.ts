import { loadIdentityStoreSnapshot as load, saveIdentityStoreSnapshot as save, getDefaultIdentityStoreDir } from "@openagenet/oan-sdk-ts/identity-store-node";
import type { OanIdentityStoreSnapshot } from "@openagenet/oan-sdk-ts";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

// The SDK identity file deliberately does not persist profile.metadata. Store
// local registration bookkeeping separately; it is never part of a DID proof.
function statePath(directory: string, did: string): string {
  return join(directory, "registration-state", `${createHash("sha256").update(did, "utf8").digest("hex")}.json`);
}

export async function loadIdentityStoreSnapshot(directory = getDefaultIdentityStoreDir()): Promise<OanIdentityStoreSnapshot> {
  const snapshot = await load(directory);
  for (const record of [...snapshot.subjects, ...snapshot.agents, ...snapshot.nodes]) {
    try {
      const state = JSON.parse(await readFile(statePath(directory, record.did), "utf8"));
      if (state.did !== record.did) throw new Error("registration_state_did_mismatch");
      record.profile.metadata = state.metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return snapshot;
}

export async function saveIdentityStoreSnapshot(snapshot: OanIdentityStoreSnapshot, directory = getDefaultIdentityStoreDir()): Promise<void> {
  await save(snapshot, directory);
  for (const record of [...snapshot.subjects, ...snapshot.agents, ...snapshot.nodes]) {
    if (!record.profile.metadata?.registrationState) continue;
    const path = statePath(directory, record.did);
    await mkdir(join(directory, "registration-state"), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ did: record.did, metadata: record.profile.metadata }) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  }
}
