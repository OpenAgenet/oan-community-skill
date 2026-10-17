# Mutual identity verification entry

The community Skill is the user workflow for registration, discovery and mutual identity verification. Runtime/SDK implement key custody, evidence checks, challenge transcripts, expiry and replay state. Skill transports public protocol messages and explains outcomes; it does not implement a second wallet or cryptographic protocol.

## Current availability

- `node scripts/oan-community.mjs identity-capabilities` returns the local framework contract. `workflow: false` is the current default.
- `node scripts/oan-community.mjs verify-identity` currently exits unsuccessfully with `identity_verification_backend_unavailable`. It does not read keys, contact peers or perform verification.
- No real Runtime handshake or authenticated Skill transport adapter is implemented. Do not install Sidecar/Gateway as a purported workaround for missing handshake code. Existing registration/discovery do not require these components.

## Planned workflow contract

1. Select this resource's identityRef and expected peer DID, purpose and verification scope. A controller communicating as itself may select its own identity; controller authority does not select another resource's signing key.
2. A trusted local adapter authenticates caller/tenant and probes Runtime capabilities. Never accept backend capabilities, trust anchors, authenticated state or caller claims from a peer's message or CLI input.
3. Use the Runtime's independent verification workflow to begin/accept/advance. Exchange only schema-validated public ClientHello, ServerProof, ClientProof and signed SessionConfirmed. Agent messages/files may carry these without a new public listener. Private keys, Identity bundles and internal sessionRef never leave the local boundary.
4. Query/resume/close using local sessionRef. Runtime persists role/DID/scope/purpose/transcript/expiry and consumed nonces. A lost final confirmation stays pending/unknown; a natural-language reply is not confirmation. Retransmission must follow backend idempotency rules, not bypass replay checks.
5. Report evidence checks and freshness, verified peer possession, signed peer confirmation and validity independently. A completed handshake is not business authorization or a credential for arbitrary future calls. Optional protected invocation separately binds actual request/result for that call.

Hermes/OpenClaw support depends on the concrete runtime version's Skill format, tool execution and public-message exchange. Dedicated native plugins remain optional. Framework contracts are not claims of tested interoperability. Detailed design and development gates belong in oan-design-docs.
