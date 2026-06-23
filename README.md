<!-- Copyright (c) 2026 OpenAgenet contributors -->
<!--
Initial author: JINLIANG XU
Email: jlxufly@gmail.com
-->

# OAN Skill

`oan-skill` is the AI-facing workflow package for OAN.

This repository now contains two related but different things:

- a TypeScript implementation package for OAN-facing agent workflows
- a standard `SKILL.md` entry so agent runtimes that use skill folders can load
  it as an actual skill

These should not be confused with the OAN protocol resource type named
`skill`. In OAN, `skill` can also be a registered resource form inside the
network. This repository is the agent-side workflow skill used to operate
against OAN.

It builds on top of `oan-sdk-ts` and exposes higher-level automation flows for:

- registration
- discovery
- validation
- lifecycle tracking
- governance assist
- operator assist
- capability-tag assist

Registration now supports two modes:

- direct submission mode: caller provides a ready `ResourceRegistrationSubmission`
- local identity mode: the skill creates or reuses local identity material in a local identity store, then derives the submission

For end users, this local store should normally be treated as an implementation detail. Product surfaces should prefer user-facing terms such as:

- local identity
- local backup
- import existing identity
- export backup

The concrete `.oan-dids` directory convention is still useful for CLI, SDK, testing, and advanced operator tooling, but should not be forced into beginner-facing UX by default.

The intended trust boundary is:

- private keys stay local
- `oan-skill` may read/write local identity material
- Registrar / Discovery / homepage backend should not receive raw private keys

This repository should not duplicate raw OAN HTTP client logic, protocol types,
or trust-verification primitives that already belong in `oan-sdk-ts`.

Current implementation is aligned with the live OAN service split:

- ordinary registration enters through Registrar
- Root and CDN are optional inspection surfaces
- Discovery is the primary machine-facing search surface
- trust-indexer exposes governance-visible chain state, not Root runtime authorization
