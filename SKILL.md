---
name: oan-skill
description: AI-facing workflow skill for OpenAgenet (OAN) resource registration, discovery, lifecycle inspection, capability-tag suggestion, governance-state reading through trust-indexer, and operator diagnostics. Use when Codex or another agent needs to interact with OAN Registrar, Discovery, Root-adjacent inspection, CDN-adjacent inspection, or trust-indexer APIs without inventing legacy agent-only flows or weakening OAN trust semantics.
---

# OAN Skill

Use this skill to drive machine-facing OAN workflows.

Treat this skill as the orchestration layer.

Use `oan-sdk-ts` as the reusable transport, protocol-type, and verification
foundation.

Do not duplicate low-level HTTP client code or trust-verification primitives
that already exist in `oan-sdk-ts`.

## Core Boundary

Keep the current real OAN service split intact:

- submit ordinary resource registration through Registrar
- treat Discovery as the primary search surface
- treat Root and CDN as inspection surfaces unless a workflow explicitly needs
  them
- treat trust-indexer as a governance-state reader, not as proof of Root-issued
  runtime authorization

Do not collapse chain-visible governance state and Root runtime authorization
into one boolean.

## Supported Workflow Families

Use this skill for these workflow families:

- validate a resource-registration submission before network calls
- register a resource through `/resources/register`
- inspect lifecycle progression from Registrar to Root to CDN to Discovery
- query Discovery and interpret query explanations
- suggest capability tags through Registrar helpers
- inspect governance-visible status through trust-indexer
- inspect operator-facing reachability, Root-facing authorization, and Discovery
  authorized domains

## Current Resource Focus

Assume the first-class resource forms are:

- `agent_service`
- `skill`
- `mcp_server`
- `tool_api`

Reject unsupported resource forms unless the underlying SDK and service surface
have been extended intentionally.

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

## Implementation Notes

If you need package internals or tests, read:

- `src/index.ts`
- `src/validation.ts`
- `src/registration.ts`
- `src/discovery.ts`
- `src/lifecycle.ts`
- `src/governance-assist.ts`
- `src/operator-assist.ts`
- `src/capability-assist.ts`
- `tests/oan-skill-tests.ts`

If you need the lower-level SDK surface, read:

- `../oan-sdk-ts/packages/client-ts/src/index.ts`
- `../oan-sdk-ts/packages/sdk-ts/src/index.ts`
- `../oan-sdk-ts/packages/governance-ts/src/index.ts`
- `../oan-sdk-ts/packages/protocol-types/src/index.ts`

## Output Expectations

Return structured results that help another agent continue the workflow:

- normalized stage
- verification findings
- error category
- error message
- suggested next actions

Prefer actionable remediation over vague failure text.

## Do Not Do

Do not:

- invent legacy `/agents/*` flows
- submit ordinary registration directly to Root
- claim trust-indexer state alone proves runtime usability
- bypass DID, metadata, hash, or proof-related checks for convenience
