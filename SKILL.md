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
- building a full local OAN topology for the user
- official release gates, deployment checks, or pressure tests
- official chain governance operations or governance-node runbooks
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
- private keys stay local; Registrar, Discovery, and homepage backends should
  not receive raw private keys

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
