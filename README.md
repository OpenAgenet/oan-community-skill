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
- register `agent_service`, `skill`, `mcp_server`, and `tool_api`
- query Discovery, including semantic query explanations when available
- inspect resource lifecycle from a product-owner perspective
- suggest capability tags

Default community posture:

- use official Registrar and Discovery endpoints unless the user configures
  third-party endpoints
- keep private keys local
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
