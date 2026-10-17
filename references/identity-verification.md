# Mutual identity verification entry

The community Skill is the user workflow for registration, discovery and mutual identity verification. Runtime/SDK implement key custody, evidence checks, challenge transcripts, expiry and replay state. Skill transports public protocol messages and explains outcomes; it does not implement a second wallet or cryptographic protocol.

## Current availability

- `oan-community identity-capabilities --identity-host ./trusted-host.mjs` probes the configured authenticated local backend. Without a host, `workflow: false` remains the default.
- `oan-community verify-identity --identity-host ./trusted-host.mjs --input ./public-input.json` calls Runtime's durable begin/accept/advance/inspect/close workflow. Missing backends return `identity_verification_backend_unavailable`.
- The trusted startup module exports `createIdentityBackend()` returning `{capabilities, call}` and delegates calls to `RuntimeToolHost.call`. Its catalog, encrypted provider, pinned Root resolver and caller/peer policy are configured locally. Peer messages and model input cannot choose this module or host secrets. Existing registration/discovery require no Runtime, Sidecar or Gateway.

## Workflow contract

1. Select this resource's identityRef and expected peer DID, purpose and verification scope. A controller communicating as itself may select its own identity; controller authority does not select another resource's signing key.
2. A trusted local adapter authenticates caller/tenant and probes Runtime capabilities. Never accept backend capabilities, trust anchors, authenticated state or caller claims from a peer's message or CLI input.
3. Use the Runtime's independent verification workflow to begin/accept/advance. Exchange only schema-validated public ClientHello, ServerProof, ClientProof and signed SessionConfirmed. Agent messages/files may carry these without a new public listener. Private keys, Identity bundles and internal sessionRef never leave the local boundary.
4. Query/resume/close using local sessionRef. Runtime persists role/DID/scope/purpose/transcript/expiry and consumed nonces. A lost final confirmation stays pending/unknown; a natural-language reply is not confirmation. Retransmission must follow backend idempotency rules, not bypass replay checks.
5. Report evidence checks and freshness, verified peer possession, signed peer confirmation and validity independently. A completed handshake is not business authorization or a credential for arbitrary future calls. Optional protected invocation separately binds actual request/result for that call.

For begin, public input is `{action:"begin",input:{identityRef,peerDid,purpose,scope,profile:"oan-session-v1",serviceRef,protocol,protocolVersion}}`. Protocol is `mcp`, `a2a` or `http`; all values must match host policy. B uses action accept, its own scope input and `message:ClientHello`. Advance uses `{action:"advance",sessionRef,message}`. Inspect/close use `{action:"inspect"|"close",sessionRef}`.

Inspect exposes only the last locally signed public `outgoing` for recovery. The wire session ID is public; possession does not grant local access. Session lifetime is 60 seconds. B may resend its exact final confirmation for the same ClientProof; duplicate final acknowledgement does not establish a new session. Old ClientHello admission and closed-session replay remain rejected. Expired sessions require a fresh handshake.

Optional `protected-call --identity-host ./trusted-host.mjs --input ./public-call.json` requires `businessProtection: true` and accepts `{routeRef,sessionRef,requestId?,payload}`. Persist a stable requestId for writes. Host-owned routes bind peer/profile/native descriptor. Requests are checked before handlers; actual responses are verified before trusted output. Dispatched calls with unknown outcome are never automatically resent: reconcile the local receipt/business result instead of changing the operation ID. This does not force ordinary later Skill calls through L2.

MCP stdio/Streamable HTTP, A2A synchronous SendMessage/Task and HTTP application envelope are distinct mappings. Streams/cancel/callback, Sidecar and Gateway remain later gates. Preserve native OAuth/TLS authentication. Pinned Root registration trust is distinct from live chain/revocation verification; unknown dimensions stay unknown.

Hermes native Skill/terminal execution is tested against the pinned lab version. OpenClaw and other runtimes require their own concrete host checks; dedicated plugins remain optional. Detailed design and development gates belong in oan-design-docs.
