# Local Runtime handoff

Registration results include `data.runtimeHandoff` when local materials were saved. This is a local-only manifest of resource DID, optional controller DID, material paths and sensitivity. It does not embed or transmit keys, credentials, or document contents. Missing VC/identity files are omitted rather than fabricated. Save failures preserve successful registration and omit the handoff.

A trusted local Runtime host must re-read the selected files, validate their DID and key bindings, verify the issued credential and registration/trust evidence, then encrypt private material through a Key Provider. Do not mark a resource authenticated merely because a handoff exists. The community skill also owns the mutual-verification orchestration path; see [identity verification](identity-verification.md). Material handoff remains separate from mutual authentication: use the explicitly configured `identity-host` backend and four-message workflow for that purpose.

The DID Document is public verification material. Registration VC is sensitive evidence. OAN Identity contains a private key and is secret; it stays local. Controller relationships do not replace the resource DID for business-message signing. Do not include local paths in public service responses or logs.
