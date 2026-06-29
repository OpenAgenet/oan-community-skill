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
endpoints:

- Registrar: `https://registrar.openagenet.xyz`
- Discovery: `https://discovery.openagenet.xyz`
- Homepage: `https://openagenet.xyz`
- Homepage API: `https://api.openagenet.xyz`

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
