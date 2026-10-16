import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "oan-cli-"));
const submissions = [];
const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/registrar/status")
    return res.end(
      JSON.stringify({
        registrarDid: "did:oan:2Xr85:HmxwAudrBEA87hc6tv9JQx91cNfLqHwv",
      }),
    );
  if (req.url === "/resources/register") {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert(!body.includes("privateKeyJwk"));
    const submission = JSON.parse(body);
    submissions.push(submission);
    return res.end(
      JSON.stringify({
        status: "submitted",
        resourceDid: submission.resourceDid,
        registrationCredential: {
          id: "urn:test:receipt",
          type: ["VerifiableCredential"],
        },
      }),
    );
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: "resource_not_found" }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const command = (...args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("scripts/oan-community.mjs"), ...args],
      { cwd: dir },
    );
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => resolveRun({ code, stdout, stderr }));
  });
const jsonFile = async (name, value) => {
  await writeFile(join(dir, name), JSON.stringify(value), "utf8");
  return name;
};
try {
  const profile = await jsonFile("profile.json", {
    nodeSelectionMode: "custom-only",
    registrarEndpoint: `http://127.0.0.1:${server.address().port}`,
    retryPolicy: { maxAttempts: 1, delayMs: 0 },
  });
  const input = await jsonFile("input.json", {
    identityDir: join(dir, "identities"),
    overrides: {
      name: "中文命令行测试技能",
      resourceType: "skill",
      endpoint: "https://example.org/tool",
      authorizedDomains: ["technology"],
      inputs: ["待审查文档"],
      outputs: ["审查结果"],
      externalIdentifiers: [{ id: "did:oan:K7mQ9:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz" }],
      implementationLinks: [{ relation: "source", targetDid: "did:oan:K7mQ9:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz" }],
    },
  });
  await writeFile(
    join(dir, "resource.md"),
    "# 中文命令行测试技能\n\n帮助用户审查技术文档，输出具体修改建议。",
    "utf8",
  );
  let result = await command(
    "draft",
    "--input",
    input,
    "--description",
    "resource.md",
    "--profile",
    profile,
    "--output",
    "draft.json",
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(submissions.length, 0);
  const draft = JSON.parse(await readFile(join(dir, "draft.json"), "utf8"));
  assert(draft.data.agentIdentity.id);
  assert.equal(draft.data.submission.didDocument.oanMetadata.externalIdentifiers[0].id,
    "OAN id: did:oan:K7mQ9:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz");
  assert(draft.data.submission.didDocument.oanMetadata.implementationLinks.some(link =>
    link.targetDid === "did:oan:K7mQ9:7YpQm9Kx2VnRb6Ts3WfHa4Cd5Ej8LgNz"));
  assert.equal(
    draft.data.submission.didDocument.oanMetadata.resourceDescription
      .inputSchema.description,
    "待审查文档",
  );
  result = await command(
    "register",
    "--input",
    "draft.json",
    "--profile",
    profile,
    "--output",
    "receipt.json",
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].resourceDid, draft.data.submission.resourceDid);
  assert.equal(
    JSON.parse(await readFile(join(dir, "receipt.json"), "utf8")).data
      .registration.registrationCredential.id,
    "urn:test:receipt",
  );
  const receipt = JSON.parse(await readFile(join(dir, "receipt.json"), "utf8"));
  const files = receipt.data.files;
  assert(files.directory.startsWith(join(dir, "identities")));
  assert.equal(
    JSON.parse(await readFile(files.didDocument, "utf8")).id,
    submissions[0].resourceDid,
  );
  assert.equal(
    JSON.parse(await readFile(files.registrationVc, "utf8")).id,
    "urn:test:receipt",
  );
  const localIdentity = JSON.parse(await readFile(files.oanIdentity, "utf8"));
  assert(localIdentity.privateKeyJwk.d);
  assert.equal(localIdentity.did, submissions[0].resourceDid);
  assert(!JSON.stringify(receipt).includes("privateKeyJwk"));
  const identitiesInput = await jsonFile("identities-input.json", {
    identityDir: join(dir, "identities"),
  });
  result = await command("identities", "--input", identitiesInput);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).data.items.length, 1);
  assert(!result.stdout.includes("privateKey"));
  const batchInput = await jsonFile("batch.json", {
    identityDir: join(dir, "identities"),
    items: [
      { sourcePath: "missing.md" },
      {
        sourcePath: "resource.md",
        overrides: {
          name: "批量技能",
          resourceType: "skill",
          endpoint: "https://example.org/tool",
          authorizedDomains: ["technology"],
        },
      },
    ],
  });
  result = await command(
    "register-batch",
    "--input",
    batchInput,
    "--profile",
    profile,
  );
  assert.equal(result.code, 1);
  const batch = JSON.parse(result.stdout);
  assert.equal(batch.data.summary.registered, 1);
  assert.equal(batch.data.summary.failed, 1);
  assert(
    batch.data.results[0].errorMessage.includes("source file read failed"),
  );
  assert(batch.data.results[1].registration.registrationCredential);
  assert(batch.data.results[1].files.oanIdentity);
  console.log("community CLI workflows passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
