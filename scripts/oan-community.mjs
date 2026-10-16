#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { OanSkill } from "../dist/index.js";

const [action, ...args] = process.argv.slice(2);
const usage =
  "Usage: node scripts/oan-community.mjs <domains|draft|register|register-description|register-batch|discover|query|list|lifecycle|credential-status|credential> --input input.json [--profile profile.json] [--output result.json]";
try {
  if (!action || action === "--help") {
    console.log(usage);
    process.exit(0);
  }
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--input", "--profile", "--output"].includes(args[i]) || !args[i + 1])
      throw new Error(usage);
    flags[args[i]] = args[i + 1];
  }
  const load = async (path) =>
    JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  const skill = new OanSkill(
    flags["--profile"] ? await load(flags["--profile"]) : {},
  );
  const input = flags["--input"] ? await load(flags["--input"]) : {};
  const actions = {
    domains: () => skill.registrationDomains(),
    draft: () => skill.draftRegistrationFromResourceDescription(input),
    register: () => skill.register(input),
    "register-description": () => skill.registerFromResourceDescription(input),
    "register-batch": () => skill.registerBatchFromResourceDescriptions(input),
    discover: () => skill.discover(input),
    query: () => skill.queryResource(input),
    list: () => skill.listResources(input),
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
    await writeFile(file, text, "utf8");
  } else process.stdout.write(text);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, errorMessage: error.message }));
  process.exitCode = 1;
}
