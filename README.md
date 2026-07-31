<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# OAN Community Skill

`oan-community-skill` is the community-facing AI workflow package for OAN.

It helps users register and discover OAN product resources through Registrar
and Discovery endpoints. It does not operate the OAN network itself.

Primary workflows:

- validate registration material
- create or reuse local identity material
- draft registration material from a resource description file or plain
  third-party resource description
- register `agent_service`, `skill`, `mcp_server`, and `tool_api`
- query Discovery, including semantic query explanations when available
- inspect resource lifecycle from a product-owner perspective
- suggest registration metadata, capability tags, and Discovery query filters

Registration submissions are finalized before they are sent to a Registrar.
The skill normalizes the DID document subset accepted by Root, fills derived
hash fields, adds resource-control proof material, and completes common
metadata bindings such as implementation links. Callers should still provide
truthful resource metadata, authorized domains, artifact URLs, and package
version information.

## Register From Resource Description

The high-level resource-description workflow is intended for two common
community cases:

- cold-start resource harvesting, where each candidate has a markdown
  description and a `Suggested OAN Registration Metadata` table
- third-party self-registration, where the owner can provide a shorter product
  description plus explicit overrides for fields such as `resourceType`,
  `endpoint`, `authorizedDomains`, and `capabilityTags`

Use `draftRegistrationFromResourceDescription()` first when the material needs
human review. It parses the description, returns an editable candidate, reports
missing fields, and creates a DID registration submission only when the minimum
registration facts are present. Use `registerFromResourceDescription()` when
the description has already been reviewed and should be submitted through the
configured Registrar.

For a single resource, registration failure is treated as a repairable
workflow result. The returned object includes the parsed `candidate`,
`missingInputs`, `qualityIssues`, the failing stage, and suggested next actions.
Fill the missing facts through `overrides` and retry the same description. Do
not silently invent authoritative facts such as endpoint URLs, licenses,
maintainers, or authorized domains.

```ts
import { readFile } from "node:fs/promises";
import { OanSkill } from "./src/index.js";

const skill = new OanSkill({
  nodeSelectionMode: "official-preferred",
});

const markdown = await readFile("resource-readme.md", "utf8");
const draft = await skill.draftRegistrationFromResourceDescription({
  markdown,
  identityDir: ".oan-community-identities",
  overrides: {
    authorizedDomains: ["technology.software_engineering"],
  },
});

if (!draft.ok) {
  console.log(draft.missingInputs);
} else {
  console.log(draft.data?.candidate);
  console.log(draft.data?.submission);
}
```

For third-party resources that are not already written in the harvested
markdown format, provide plain text and structured overrides:

```ts
await skill.registerFromResourceDescription({
  text: "A public MCP server for repository search and issue triage.",
  identityDir: ".oan-community-identities",
  overrides: {
    resourceType: "mcp_server",
    name: "Repository Triage MCP Server",
    endpoint: "https://example.org/mcp",
    protocol: "mcp",
    authorizedDomains: ["technology.software_engineering"],
    capabilityTags: ["protocol.mcp", "developer-tooling", "repository-search"],
    useCases: ["Find code repositories", "Summarize issue context"],
    inputs: ["Natural language development query"],
    outputs: ["Repository or issue candidates"],
  },
});
```

For batch onboarding, use `registerBatchFromResourceDescriptions()`. The batch
workflow is designed for cold-start registration work: it attempts every item,
skips resources that are missing required facts or are rejected by the
Registrar, and returns a structured log for later review.

```ts
const batch = await skill.registerBatchFromResourceDescriptions({
  identityDir: ".oan-community-identities",
  items: [
    { id: "resource-001", markdown: await readFile("resource-001.md", "utf8") },
    { id: "resource-002", markdown: await readFile("resource-002.md", "utf8") },
  ],
});

console.log(batch.data?.summary);
console.table(batch.data?.results.map((item) => ({
  id: item.id,
  status: item.status,
  resourceDid: item.resourceDid,
  missingInputs: item.missingInputs?.join(", "),
  errorMessage: item.errorMessage,
})));
```

Each resource description should contain enough text for Discovery users to
understand what the resource does after finding its DID document. Use a
registration description of roughly 200-400 English words, or 200-400 Chinese
characters for Chinese material, covering purpose, public access path, protocol
or interface, inputs, outputs, and typical use cases. Short one-line
descriptions are reported as quality issues even when the minimum registration
fields are present.

If another agent or third-party user only has this skill and a folder of
resource description files, the files should carry at least:

- resource name and resource type
- public endpoint, manifest URL, package page, repository, or download URL
- explicit authorized domains accepted by the selected Registrar
- capability tags, use cases, inputs, and outputs
- license, maintainer, upstream source, and version when known
- a 200-400 word or character registration description

The draft helper deliberately treats suggestions as editable metadata. It does
not assume that a short description can safely determine final authorized
domains. Final submissions still need explicit domains accepted by the selected
Registrar.

Default community posture:

- use the official public website gateway, `https://www.openagenet.xyz`, unless
  the user configures third-party endpoints
- keep official endpoint defaults centralized through the SDK-derived default
  profile so future official IP/domain migration is a one-place update
- keep private keys local
- treat assisted suggestions as editable user help: `authorizedDomains` must
  stay valid for the selected Registrar, while `capabilityTags` can be edited,
  removed, or extended
- treat Root and CDN as lifecycle inspection surfaces, not ordinary user
  operation surfaces
- do not start a full local Root/Registrar/Discovery/CDN/NATS topology

Official operations, pressure tests, local/cloud deployment environment setup,
and chain-governance runbooks are outside this community package. Community
governance helpers are read-only status checks; proposal creation, voting,
execution refresh, deployment, and package upgrades belong in official
operations skills. Do not assume access to a Root-private trust-indexer;
community users who need governance-state reads should use an explicit public
endpoint or run their own indexer. Registrar and Discovery nodes do not run an
indexer by default.

The TypeScript implementation builds on `oan-sdk-ts` and should not duplicate
low-level protocol types, HTTP transport, or verification primitives.
