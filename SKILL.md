---
name: oan-community-skill
description: Help community users register OAN resources or controllers, discover resources, query records and registration credentials, and inspect publication progress through official or user-configured Registrar/Discovery services. Includes local identity signing and batch resource onboarding. Excludes OAN Forum and infrastructure operations.
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
- registering a dedicated `controller`, or using a registered resource/controller
  to authorize another resource
- querying individual resource records, bounded resource pages, registration
  credential status, and controller-authorized registration VC retrieval

Do not use this skill for:

- OAN Forum login, publishing, editing, hiding, or moderation
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
`baseUrl` or endpoints. The live community gateway default is centralized in
`DEFAULT_OAN_SKILL_OFFICIAL_ENDPOINTS.baseUrl`; SDK subdomain constants are
reference values, not the default transport for this package.

- Base URL: `https://www.openagenet.xyz`
- Homepage: `https://openagenet.xyz`
- Homepage API: `https://www.openagenet.xyz`

Use the public website gateway for community registration and Discovery
scripts that need to work against the deployed official website. Keep the SDK's
lower-level endpoint defaults as implementation references; this community
skill should prefer the website gateway unless a user supplies third-party
endpoints.

The public Network page may list recognized test Registrar or Discovery nodes
for operator testing and multi-node visibility. Do not treat loopback or
internal test-node endpoints shown in operator material as community defaults.
Community workflows should continue to use the official base URL
`https://www.openagenet.xyz` unless the user explicitly provides reachable
third-party endpoints.

Use `baseUrl` as the normal user-facing configuration. The SDK derives
Registrar, Discovery, Root, and CDN calls from that base URL. If a user or
third-party operator provides explicit `registrarEndpoint`, `discoveryEndpoint`,
`rootReferenceEndpoint`, or `cdnReferenceEndpoint` values, those endpoint values
override `baseUrl` for their corresponding nodes.

Use `nodeSelectionMode: "official-preferred"` by default. Use
`"custom-only"` when the user explicitly wants a third-party Registrar and
Discovery pair or a third-party `baseUrl`. Use `"custom-preferred"` only when
fallback to official nodes is acceptable for that workflow.

`registrarEndpoint` and `discoveryEndpoint` explicitly override the selected
endpoint for their service. `custom-only` has no implicit official base URL:
an omitted service is unavailable, not silently redirected to official nodes.
It can be used with just one service for search-only or registration-only use.
Endpoint arrays choose the first endpoint according to the mode; they do not
perform automatic failover. Signed writes must never be replayed against
another Registrar. Read retries are bounded; registration POSTs are not retried.

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

`controller` is additionally supported by `register({generateIdentity: ...})`
as an identity-control role, not a fifth discoverable product form.

## Execution And Registration Ownership

Read [references/community-workflows.md](references/community-workflows.md) for
CLI input examples, all three ownership scenarios, third-party configuration,
resource queries, and credential retrieval.

From this package, run `npm ci`, then `npm run build`. The reusable entry point is
`node scripts/oan-community.mjs --help` (installed npm command: `oan-community`).
All input/output files use UTF-8. Keep identity directories and credential
receipts outside Git; the CLI's `--output` saves structured results locally.
Use Node.js 22 or newer. Use `identities` to find saved identity IDs without
printing keys. `draft --description resource.md --input metadata.json --output
draft.json` reads a local description; `register --input draft.json --output
receipt.json` submits that exact reviewed draft. Both commands need the same
third-party profile when used. Batch CLI inputs may use `sourcePath`; per-item
results retain registration receipts and return failure for incomplete batches.
Use `capability-tags`, `suggest-registration`, and `suggest-query` for optional
public metadata assistance. Keep suggestions editable and do not treat them as
Registrar authorization.

Resolve the actual Registrar DID through the selected node's
`GET /registrar/status` before generating routing codes or signing. An explicit
`registrarDid` is an expected identity and must match that node. Do not use a
sample DID or derive identity from a hostname.

- Default: a resource controls itself. It has its own local private key and
  needs no unregistered developer/controller identity.
- Dedicated controller: register `resourceType: "controller"` first, preserving
  the signed DID document and local identity. This action registers one identity;
  it does not silently register extra resources.
- External controller: supply `controllerIdentityId` (or `subjectIdentityId`)
  from the local store, or an explicit local `controllerIdentity`. It must already
  be registered as required by the selected Registrar. The resource still has
  its own signing key. Controller authorization concerns registration/document
  updates; it does not replace the resource's identity.

Choose the registration scenario from the user's stated purpose. Default to
self-control when registering a resource; do not create an extra controller just
because the resource has a human author or belongs to a company. If the user
states that the identity represents a natural person or a legal person AND will
be used later to register/manage that person's or entity's agent resources,
choose dedicated-controller registration with `generateIdentity.resourceType:
"controller"`. Tell the user that this is the selected scenario and why, then
use the normal `register` workflow (not the four-product description workflow).
For example: “根据你的用途，本次将注册 controller 身份，代表该自然人或法人；后续可用它授权注册所管理的智能体资源，并管理相关 DID 文档更新。各智能体仍保有自己的身份和签名私钥。”
Use the user's actual name/label and description; the controller role alone does
not establish verified real-world identity or legal-person certification.
If the user already has a registered controller and wants to register a managed
resource, choose the external-controller scenario and reuse that identity.
Preserve an explicit user choice among all three scenarios.

The implementation retains the controller's exact signed DID document rather
than rewriting its resource type. A prepared signed submission is transmitted
unchanged. Missing/expired control proofs require re-signing with local resource
and controller identities; recomputing hashes alone cannot repair a signature.
Registration records are persisted as `pending` before the write because the
resource key is needed to sign the submission. A rejected write marks that
identity `failed` and records the service error; a later generated registration
with the same label, resource type, and Registrar reuses it instead of silently
creating another DID. This is local retry/audit state, not automatic deletion or
revocation. The identity directory remains the user’s responsibility to back up
and explicitly clean up when an abandoned identity is no longer wanted.

`identityDir` is a local key and artifact path. It must never be sent as a
resource endpoint. Registration still requires a real public endpoint,
manifest/download URL, or repository URL as appropriate; a repository URL does
not imply an executable endpoint, and a local filesystem path is not public
resource material.

The DID Document hash includes proof and follows the Root's typed wire
serialization projection. Legacy `useCases`, `inputs`, and `outputs` fields are
not part of that Rust structure; use `useCaseExamples`, `inputSchema`, and
`outputSchema` instead. Do not change hash rules based only on a rejection code.
The current Registrar exposes no write dry-run compatibility endpoint, so
preflight can check local protocol structure and node status but cannot promise
acceptance without submission. Rejection diagnostics include the submitted hash
and resource/Registrar identifiers when the server does not return an expected
hash.

Local retry state is stored in `registration-state` sidecar files because the
SDK identity file does not persist `profile.metadata`. It is not a server-side
idempotency key or a distributed transaction. After a timeout, query the same
DID's lifecycle before retrying; never discard its private key automatically.

`draftRegistrationFromResourceDescription()` reads node status and generates
local signed material, but does not publish. It creates one resource identity;
`registerFromResourceDescription()` submits that draft without generating a
second identity. Use explicit `agentIdentityId` for retries or a new version;
automatic reuse requires matching name, type, Registrar routing and controller.

## Resource Description Registration

Omit `externalIdentifiers` by default. Populate it only when the user explicitly
requests external identifiers, or explicitly states that the resource comes
from an external network platform and the supplied information is sufficient
to establish its external identifier and resolution address (for example the
platform name, platform link, or a platform-provided resolution endpoint).
Providing a specific GitHub repository, npmjs package page, or aggregator
resource link (including platforms such as SkillHub) as the resource's source counts as identifying its external
platform origin; no separate request to add external identifiers is needed.
Derive the native identifier and resolution address from that link and include
them in `overrides.externalIdentifiers` before drafting/registration. For an
aggregator, extract the platform and native resource ID or namespaced slug
from the resource URL; inspect the linked page when its meaning is unclear.
Use a resolution base with a confirmed lookup rule, or the full resource page,
so that the identifier and resolution address let others find that resource.
Respect
an explicit request to omit external identifiers. Do not invent an ID
or describe a generic platform homepage as a dedicated resolution API. If the
user requests external identity but necessary facts are missing, ask for those
facts while continuing the rest of the draft. See
[external identifier guidance](references/community-workflows.md#external-identifiers-and-related-oan-identities)
for standard inputs and the optional `OAN id: ` textual prefix feature.

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
- resource/subject type is metadata; a DID routing-code does not encode type
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

`includeExplanation: false` skips the extra explain request. A zero-result search
is successful but does not prove any particular resource is indexed. Never turn
`preferredDomain` into a capability tag or invent an authorization-domain query
filter: the current query schema has text/type/tags/protocol/version/limit.

`queryResource()` returns either the Registrar's public record or the Discovery
package. `listResources()` fetches one bounded page (default 20, maximum 100)
and retains its continuation cursor. A missing Discovery record does not mean
registration failed. Public Registrar records deliberately omit the registration
VC. `registrationCredentialStatus()` reads its status; `registrationCredential()`
uses the registered controller's local signature for the private VC query.
The current Registrar only enables that query when its stored controller-access
binding permits it; self-controlled/older registrations may return 403. Preserve
the VC from the original registration response instead of promising recovery.

## Implementation Notes

Read these files when changing package behavior:

- `src/index.ts`
- `src/validation.ts`
- `src/registration.ts`
- `src/resource-description.ts`
- `src/discovery.ts`
- `src/lifecycle.ts`
- `src/capability-assist.ts`
- `src/query.ts`
- `src/registrar.ts`
- `scripts/oan-community.mjs`
- `tests/oan-community-skill-tests.ts`
- `tests/community-current-contract-tests.ts`

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

After every successful registration (including each successful batch item),
tell the user the exact absolute directory and file paths from `data.files`.
Explain each file and when to use it:

- DID Document (`did-document.json`): the signed public document containing the
  DID, verification methods/public keys, controller and resource metadata/services;
  used for identity resolution, signature verification and resource discovery.
- Registration VC (`registration-vc.json`): issued by the Registrar, proving the
  registration claims and scope; used when presenting registration credentials or
  checking identity/authorization with a relying service. It contains no signing
  private key, but can contain sensitive claims. Possession alone is not a substitute
  for signing or for the relying service's authorization checks.
- OAN Identity (`identity.json`): the locally generated identity containing its
  private key and DID document; used for local signing, resource updates, controller
  authorization of managed resources, and authorized credential queries as
  applicable. A resource's identity signs for that resource; a controller's identity
  authorizes its managed resources. Private keys are not uploaded.

Tell the user to keep these files in a secure location, especially the VC and
OAN Identity, with a secure backup and restricted access. Do not publish them in
Git, a public folder or chat. The DID document may be shared for verification;
review its metadata for privacy before sharing. Preserve the registration receipt
too, as it contains the issued VC. Mention that local identity JSON is not encrypted
by this helper and Windows permissions depend on filesystem ACLs.

Report only files actually saved: `registrationVc` is absent if the service did
not return a VC, and `oanIdentity` is absent if a pre-signed submission has no
matching local identity. For the latter, explain that the private identity remains
with its original creator; never claim a new key was generated. If `fileSaveError`
is present, registration succeeded but file saving failed: preserve the returned
registration response immediately and repair local saving without registering a
new identity. Never print private-key content to explain a file.

Return structured results that help another agent continue the workflow:

- normalized stage
- verification findings
- error category
- error message
- suggested next actions

Prefer actionable remediation over vague failure text.
