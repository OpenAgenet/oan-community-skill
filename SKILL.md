---
name: oan-community-skill
description: Community-facing OpenAgenet (OAN) workflow skill for registering agent_service, skill, mcp_server, and tool_api resources through Registrar, querying Discovery including semantic discovery/explain results, validating registration submissions, managing local user/product identity material, and checking resource lifecycle against official or user-configured Registrar/Discovery endpoints. Use when helping community users consume OAN rather than operate OAN infrastructure.
---

# OAN Community Skill

Use this skill for community-facing OAN usage workflows.

Keep this package focused on users who want to register products into OAN and
discover products from OAN. Do not use it to start a full local OAN network,
run pressure tests, perform official governance operations, or maintain official
deployment environments.

## Boundary

Use this skill for:

- validating a resource registration submission
- creating or reusing local identity material for a resource owner
- drafting registration material from a resource description file, harvested
  resource markdown, or a third-party plain-text product description
- batch-registering resource description files while skipping and recording
  items that cannot be registered yet
- registering `agent_service`, `skill`, `mcp_server`, or `tool_api` through a
  Registrar
- querying Discovery, including semantic query explanations when available
- checking whether a registered resource has become visible in Discovery
- suggesting capability tags for public product registration
- using the official Registrar/Discovery by default, or user-configured
  third-party Registrar/Discovery endpoints

Do not use this skill for:

- starting Root, Registrar, Discovery, CDN, NATS, or PostgreSQL locally
- assuming access to a Root-private trust-indexer endpoint
- building a full local OAN topology for the user
- official release gates, deployment checks, or pressure tests
- official chain governance operations or governance-node runbooks
- chain-governance proposal creation, voting, execution refresh, package
  deployment, or package upgrade signing
- private genesis material, private benchmark fixtures, or official operator
  secrets

## Endpoint Model

Prefer official public endpoints unless the user provides explicit third-party
`baseUrl` or endpoints. The TypeScript implementation should source official
defaults from the SDK's `DEFAULT_OAN_OFFICIAL_ENDPOINTS` through
`DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS`, so future official IP/domain migration
is centralized.

- Base URL: `https://www.openagenet.xyz`
- Homepage: `https://openagenet.xyz`
- Homepage API: `https://api.openagenet.xyz`

Use the public website gateway for community registration and Discovery
scripts that need to work against the deployed official website. Keep the SDK's
lower-level endpoint defaults as implementation references; this community
skill should prefer the website gateway unless a user supplies third-party
endpoints.

Use `baseUrl` as the normal user-facing configuration. The SDK derives
Registrar, Discovery, Root, and CDN calls from that base URL. If a user or
third-party operator provides explicit `registrarEndpoint`, `discoveryEndpoint`,
`rootReferenceEndpoint`, or `cdnReferenceEndpoint` values, those endpoint values
override `baseUrl` for their corresponding nodes.

Use `nodeSelectionMode: "official-preferred"` by default. Use
`"custom-only"` when the user explicitly wants a third-party Registrar and
Discovery pair or a third-party `baseUrl`. Use `"custom-preferred"` only when
fallback to official nodes is acceptable for that workflow.

Root and CDN may be used only as lifecycle inspection surfaces. Community users
should normally interact through Registrar and Discovery concepts.

## Resource Focus

Assume these first-class resource forms:

- `agent_service`
- `skill`
- `mcp_server`
- `tool_api`

Reject unsupported resource forms unless the protocol types and live service
surface have been intentionally extended.

## Resource Description Registration

When a user wants to register a resource from a README, harvested markdown file,
catalog entry, or free-form resource description, use the resource-description
workflow before asking them to write a DID document by hand.

Prefer this sequence:

1. Call `draftRegistrationFromResourceDescription()` with the markdown or text.
2. Review the returned `candidate`, `missingInputs`, and `qualityIssues`.
3. Ask the user or source-specific collector to fill missing facts through
   `overrides`.
4. Call `registerFromResourceDescription()` only after `authorizedDomains`,
   public access URL, name, and description are present.

For one resource, do not hide a failed registration attempt. Return or explain
the failing stage, parsed candidate, missing inputs, quality issues, endpoint
or Registrar error, and the exact facts needed for a retry. After the user
provides those facts, retry by passing them through `overrides`.

For batch resource onboarding, use `registerBatchFromResourceDescriptions()`.
The batch workflow should continue after an item fails validation or is
rejected by the Registrar. Record each item with its `id` or `sourcePath`,
status, parsed candidate, missing inputs, quality issues, error message, and
suggested next actions. Skip failed items in the current pass and leave them
for targeted manual repair.

The parser understands the cold-start markdown convention with
`## Suggested OAN Registration Metadata`, including rows for `resourceType`,
`name`, `version`, `endpoint`, `protocol`, `schemaUrl`, `downloadUrl`,
`repositoryUrl`, `packageUrl`, `authorizedDomains`, `capabilityTags`,
`useCases`, `inputs`, `outputs`, `license`, and `maintainer`. It also extracts
basic source links from `## Source And Access`.

For third-party owners who only have free text, keep the workflow explicit:
derive a readable draft where possible, but use `overrides` for authoritative
facts. Do not invent an endpoint, maintainer, license, or authorization domain.
`authorizedDomains` are authorization scope, not search tags; they must remain
valid for the selected Registrar. `capabilityTags`, use cases, inputs, and
outputs are discovery metadata and can be edited by the resource owner.

Registration descriptions should be long enough to help a Discovery user decide
whether the resource is useful after reading the DID document. Prefer roughly
200-400 English words, or 200-400 Chinese characters for Chinese material.
Cover the resource purpose, public access path, protocol or interface, inputs,
outputs, and typical use cases. Treat one-sentence descriptions as quality
issues and ask the user or source collector to expand them.

Support Chinese and English resources with a strict field boundary. Natural
language fields such as `description`, `capabilityDescription`,
`useCaseExamples`, `examples`, `inputs`, and `outputs` may contain Chinese,
English, or mixed-language text. `capabilityTags` should prefer canonical
English tags from the capability vocabulary, but Chinese capability terms are
allowed as supplemental Discovery signals when no suitable canonical tag is
available. `authorizedDomains` must stay in the selected Registrar's canonical
domain set, normally lowercase ASCII identifiers such as
`technology.software_engineering` or `legal.contract_law`; never translate
them into Chinese or use Chinese phrases as authorization scope.

When only this skill and a folder of batch description files are available, the
description files must be sufficient for registration and post-registration
checking. They should include name, resource type, public access URL, explicit
authorized domains, capability tags, use cases, inputs, outputs, license,
maintainer, source URL, and version when known. Use `overrides` for any facts
that are missing from the file but provided by the user.

The generated submission should reuse the normal registration finalization
path. It should preserve implementation links, protocol bindings, package
information, resource description, capability tags, and authorized domains in
the DID document metadata, then let the registration helper normalize hashes
and proof fields before submission.

## Required Semantics

Preserve these semantics:

- `resourceDid` must be `did:oan`
- `resourceType` must match the DID subject code
- `didDocument.id` must equal `resourceDid`
- `oanMetadata.resourceType` and `oanMetadata.subjectType` must match the
  submission resource type
- protocol bindings must resolve to declared DID services when `serviceRef` is
  present
- hash fields should use `algorithm:value` shape
- registration helpers should finalize submissions before sending them:
  normalize the Root-facing DID document subset, fill `didDocumentHash`,
  `metadataHash`, `packageHash`, and attach subject-control proof material
- `oanMetadata.authorizedDomains` should be explicit for registered resources
  when the Registrar or user workflow knows the intended authorization domain
- private keys stay local; Registrar, Discovery, and homepage backends should
  not receive raw private keys

## Authorized Domains

For community resource registration, treat `authorizedDomains` as a first-class
authorization field, separate from `capabilityTags`.

- Require final registration submissions to carry non-empty
  `didDocument.oanMetadata.authorizedDomains`.
- Use `["*"]` only when all-domain authorization is intentionally granted by
  the selected Registrar or workflow.
- Use concrete canonical domains when the product belongs to a known domain,
  and keep them sorted and unique.
- Keep authorized-domain values canonical and machine-readable; do not use
  Chinese, free-form natural-language phrases, endpoint hostnames, or
  capability-tag-like values as `authorizedDomains`.
- Leave domain selection to the user or Registrar when the community workflow
  cannot determine it safely, but do not submit a final registration until the
  Registrar/user workflow has written explicit domains.
- Do not infer authorized domains from DID semantic code.
- Do not use capability tags to widen authorization.
- Preserve capability tags as search and semantic discovery signals.

Read `references/authorized-domains-community.md` when helping a user choose
resource domains, diagnose Registrar rejection codes such as
`resource_domains_required`, `invalid_authorized_domains`, or
`unauthorized_domains`, or explain why Discovery results are filtered by
authorization scope.

## Discovery And Semantic Search

Use `/discovery/resources/query` as the main Discovery surface. Treat semantic
search as a Discovery-side enhancement of that query flow, not as a separate
community workflow requiring users to operate Discovery infrastructure.

When available, read `/discovery/query/explain` output to explain why candidates
matched. If semantic search is disabled or falls back to keyword search, present
that as normal and continue with the returned candidates.

## Implementation Notes

Read these files when changing package behavior:

- `src/index.ts`
- `src/validation.ts`
- `src/registration.ts`
- `src/resource-description.ts`
- `src/discovery.ts`
- `src/lifecycle.ts`
- `src/capability-assist.ts`
- `tests/oan-community-skill-tests.ts`

`src/governance-assist.ts` and `src/operator-assist.ts` are compatibility
helpers from an earlier broader boundary. Do not grow them for new community
workflows.

Community governance support is read-only. It may call trust-indexer to explain
whether a Registrar, Discovery node, or VC issuer appears active, but it must
not submit governance proposals, votes, execution refreshes, package upgrades,
or other chain writer transactions.

Do not assume the indexer used by an official Root node is available to
community users. If a community workflow needs governance-state reads, use an
explicit user-provided/public trust-indexer endpoint or guide the operator to
run their own indexer. Registrar and Discovery nodes do not run trust-indexer by
default in the current model.

If lower-level SDK details are needed, read:

- `../oan-sdk-ts/packages/client-ts/src/index.ts`
- `../oan-sdk-ts/packages/sdk-ts/src/index.ts`
- `../oan-sdk-ts/packages/protocol-types/src/index.ts`

## Output Expectations

Return structured results that help another agent continue the workflow:

- normalized stage
- verification findings
- error category
- error message
- suggested next actions

Prefer actionable remediation over vague failure text.
