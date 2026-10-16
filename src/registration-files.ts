import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { loadIdentityStoreSnapshot } from "@openagenet/oan-sdk-ts/identity-store-node";
import type {
  ResourceRegistrationSubmission,
  ResourceRegistrationResponse,
} from "@openagenet/oan-sdk-ts/protocol-types";
import type { RegistrationFiles } from "./types.js";

/** Materialize the actual signed document and issued VC without exporting keys. */
export async function saveRegistrationFiles(
  identityDir: string,
  submission: ResourceRegistrationSubmission,
  registration: ResourceRegistrationResponse,
): Promise<RegistrationFiles> {
  const storeDir = resolve(identityDir);
  const snapshot = await loadIdentityStoreSnapshot(storeDir);
  const identity = [...snapshot.subjects, ...snapshot.agents].find(
    (record) => record.did === submission.resourceDid,
  );
  const resourceKey = createHash("sha256")
    .update(submission.resourceDid, "utf8")
    .digest("hex");
  // Every accepted submission gets a separate receipt, preserving previous versions.
  const directory = join(storeDir, "registrations", resourceKey, randomUUID());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const files: RegistrationFiles = {
    directory,
    didDocument: join(directory, "did-document.json"),
    receipt: join(directory, "registration-response.json"),
  };
  const save = async (path: string, value: unknown) =>
    writeFile(path, JSON.stringify(value, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  await save(files.didDocument, submission.didDocument);
  await save(files.receipt, registration);
  if (registration.registrationCredential != null) {
    files.registrationVc = join(directory, "registration-vc.json");
    await save(files.registrationVc, registration.registrationCredential);
  }
  if (identity) {
    const bucket = identity.kind === "subject" ? "subjects" : "agents";
    const path = join(storeDir, bucket, identity.id, "identity.json");
    // Confirm the reported identity file exists and is the resource just registered.
    const { readFile } = await import("node:fs/promises");
    const saved = JSON.parse(await readFile(path, "utf8"));
    if (saved.did !== submission.resourceDid)
      throw new Error("saved_identity_did_mismatch");
    files.oanIdentity = path;
  }
  return files;
}
