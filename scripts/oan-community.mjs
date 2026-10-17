#!/usr/bin/env node
// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { OanSkill, listLocalIdentities, COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES, identityVerificationUnavailable } from "../dist/index.js";

const [action, ...args] = process.argv.slice(2);
const usage =
  "Usage: oan-community <identity-capabilities|verify-identity|domains|identities|draft|register|register-description|register-batch|discover|query|list|lifecycle|credential-status|credential|capability-tags|suggest-registration|suggest-query|validate> [--input input.json] [--description resource.md] [--profile profile.json] [--output result.json]\nregister accepts the JSON output of draft directly. list defaults to Discovery. Relative input paths use the current working directory.";
try {
  if (!action || action === "--help") {
    console.log(usage);
    process.exit(0);
  }
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--input", "--profile", "--output", "--description"].includes(
        args[i],
      ) ||
      !args[i + 1]
    )
      throw new Error(usage);
    flags[args[i]] = args[i + 1];
  }
  const load = async (path) =>
    JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  const skill = new OanSkill(
    flags["--profile"] ? await load(flags["--profile"]) : {},
  );
  let input = flags["--input"] ? await load(flags["--input"]) : {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("input JSON must be an object");
  if (action === "register" && input.data?.submission) {
    if (!input.ok) throw new Error("Cannot register an unsuccessful draft");
    input = {
      submission: input.data.submission,
      identityDir: input.data.identityDir,
    };
  }
  if (flags["--description"]) {
    if (!["draft", "register-description"].includes(action))
      throw new Error("--description is for draft/register-description");
    input.markdown = await readFile(flags["--description"], "utf8");
  }
  if (action === "register-batch" && Array.isArray(input.items)) {
    input.items = await Promise.all(
      input.items.map(async (item) => {
        if (
          item?.sourcePath &&
          item.markdown === undefined &&
          item.text === undefined
        ) {
          try {
            return {
              ...item,
              markdown: await readFile(item.sourcePath, "utf8"),
            };
          } catch (error) {
            return { ...item, sourceReadError: error.message };
          }
        }
        return item;
      }),
    );
  }
  const actions = {
    "identity-capabilities": () => ({ ok: true, data: COMMUNITY_IDENTITY_VERIFICATION_CAPABILITIES }),
    "verify-identity": () => identityVerificationUnavailable(),
    domains: () => skill.registrationDomains(),
    identities: () => listLocalIdentities(input),
    "capability-tags": () => skill.capabilityAssist(input),
    "suggest-registration": () => skill.registrationMetadataAssist(input),
    "suggest-query": () => skill.discoveryQueryAssist(input),
    validate: () => skill.validate(input),
    draft: () => skill.draftRegistrationFromResourceDescription(input),
    register: () => skill.register(input),
    "register-description": () => skill.registerFromResourceDescription(input),
    "register-batch": () => skill.registerBatchFromResourceDescriptions(input),
    discover: () => skill.discover(input),
    query: () => skill.queryResource(input),
    list: () => skill.listResources({ source: "discovery", ...input }),
    lifecycle: () => skill.lifecycle(input),
    "credential-status": () =>
      skill.registrationCredentialStatus(input.resourceDid),
    credential: () => skill.registrationCredential(input),
  };
  if (!actions[action]) throw new Error(usage);
  const result = await actions[action]();
  const text = JSON.stringify(result, null, 2) + "\n";
  if (flags["--output"]) {
    const file = resolve(flags["--output"]);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, { encoding: "utf8", mode: 0o600 });
  } else process.stdout.write(text);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, errorMessage: error.message }));
  process.exitCode = 1;
}
