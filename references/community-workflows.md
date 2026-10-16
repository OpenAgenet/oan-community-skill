# Community registration, discovery and queries

The default gateway `https://www.openagenet.xyz` routes to the official
Registrar and Discovery. No server keys, private indexer or Forum access is needed.

## Running the skill

Use Node.js 22 or newer (Node.js 24 LTS recommended). A source checkout needs
`npm ci` and a build; the published npm package includes its compiled entry point.

In a source checkout:

```powershell
npm ci
npm run build
node scripts/oan-community.mjs domains --output domains.json
node scripts/oan-community.mjs discover --input search.json --output search-result.json
```

The npm package also exposes `oan-community` as the equivalent command. Inputs,
profiles and outputs are UTF-8 JSON. CLI actions return `{ok,data,...}` and exit
nonzero on failure. `--output` preserves the full result, including a registration
VC when returned; treat such receipts as private local material. Identity output
summaries contain IDs/DIDs/profiles, never private keys. Keys remain in the local
store (`~/.oan-dids` by default, or explicit `identityDir`).

List saved identities without exposing keys:

```powershell
node scripts/oan-community.mjs identities --input identity-location.json
```

`identity-location.json` is `{"identityDir":".oan-community-identities"}`.
The result shows IDs, DIDs, labels, resource types and controller DIDs. Reuse the
ID from the intended identity, and back up the local identity directory. An empty
list is not evidence that a registration never happened: verify the directory.
Relative paths use the command's working directory.

## Files delivered after registration

Registration automatically writes the signed DID document, the full service
response, and the returned VC under
`<identityDir>/registrations/<DID SHA-256>/<unique receipt ID>/`. Every accepted
submission has its own directory so earlier version receipts remain available.
The result's `data.files` gives the absolute paths; batch items have `files` too.
The existing OAN Identity stays in
`<identityDir>/agents/<identity ID>/identity.json` for resources, or
`<identityDir>/subjects/<identity ID>/identity.json` for dedicated controllers.
It is referenced, not duplicated into the receipt directory.

| File | Contents and use | Handling |
|---|---|---|
| `did-document.json` | Signed DID, public keys, controller, resource metadata and services; for resolution, signature verification and discovery | Public verification material; review metadata before sharing |
| `registration-vc.json` | Registrar-issued registration claims and scope; for presenting registration evidence and identity/authorization checks where required | Keep private and back up securely; it contains claims, not the signing private key |
| `identity.json` (OAN Identity) | Locally generated private key and DID document; for local signatures, updates and controller authorization or credential queries as applicable | Keep secret, restrict access, and securely back up; never upload or put in Git/chat |
| `registration-response.json` | Original service response, including the VC when issued | Protect it like the VC and retain it for recovery |

After success, explain these uses and report the actual absolute paths to the
user. Controller authorization concerns its managed resources; each resource
retains its own identity/key. A VC does not by itself authorize arbitrary actions.
Keep all materials in a secure location, especially the VC and OAN Identity.
Local identity JSON is not encrypted by this helper; Windows ACLs must provide
the intended filesystem access protection.

If no VC is returned, `registrationVc` is absent: do not promise that a file was
created. A pre-signed submission without a matching local identity has no
`oanIdentity` path; its original creator holds the key. `fileSaveError` means
registration succeeded but local saving failed. Save `data.registration`
immediately (CLI `--output` retains it), fix local storage and do not create a
second identity just to recover files.

## Official and third-party nodes

Omit `--profile` for official services. For a third-party gateway:

```json
{"nodeSelectionMode":"custom-only","baseUrl":"https://gateway.example"}
```

For separate nodes, save a profile such as:

```json
{
  "nodeSelectionMode":"custom-only",
  "registrarEndpoint":"https://registrar.example",
  "discoveryEndpoint":"https://discovery.example",
  "requestTimeoutMs":30000
}
```

Pass `--profile profile.json` to every action using that network. Each endpoint
is the service base before paths such as `/resources/register` or
`/discovery/resources/query`; it may include a deployment prefix if the operator
provides one. It must not contain embedded passwords, query strings or fragments.
Use real operator-provided addresses; these examples are placeholders.

In `custom-only`, omitted services remain unavailable. Root/CDN inspection is
disabled unless explicitly configured with reference endpoints or enabled by the
caller. Do not copy loopback endpoints reported in node status into public client
configuration. `registrarDid`, if set, must match `/registrar/status`.

Legacy `customRegistrarEndpoints`/`customDiscoveryEndpoints` arrays remain
supported. `official-preferred` selects official services first;
`custom-preferred` selects configured custom entries first. These modes select
an endpoint before a workflow; they do not retry signed writes at another node.

## Three registration scenarios

Default to a self-controlled resource. Choose a dedicated `controller` when the
user explicitly wants an identity representing a natural person or legal person
and intends to use it later to register/manage that person's or entity's agent
resources. Explain the choice before registration; merely mentioning a company
or an author does not imply this scenario. If a registered controller already
exists and the current task is registering its managed resource, reuse it in
scenario 3. Honor an explicit scenario choice.

Suggested explanation: “根据你的用途，本次将注册 controller 身份，代表该自然人或法人；后续可用它授权注册所管理的智能体资源，并管理相关 DID 文档更新。各智能体仍保有自己的身份和签名私钥。”
Registering this role does not itself certify a person's real-world identity or
an entity's legal status.

1. **Self-controlled resource.** No controller input is needed. Save as `self.json`:

   ```json
   {
     "identityDir":".oan-community-identities",
     "generateIdentity":{
       "resourceLabel":"My weather API",
       "resourceType":"tool_api",
       "description":"An API maintained by our team for weather observations.",
       "endpoint":"https://your-service.example/weather",
       "schemaUrl":"https://your-service.example/openapi.json",
       "authorizedDomains":["technology.software_engineering"],
       "capabilityTags":["weather"]
     }
   }
   ```

   Replace addresses and metadata with the user's real resource. Read `domains`
   first: authorization scope must be covered by the selected Registrar.
   Run `register --input self.json --output registration.json`. Identity and DID
   document are generated locally; the Registrar issues the registration VC.

2. **Dedicated controller.** Use `generateIdentity.resourceType: "controller"`,
   a truthful `resourceLabel`/description, and explicit `authorizedDomains`.
   An endpoint is optional. Run `register` and preserve the returned local
   `data.agentIdentity.id`, signed document, private identity and registration VC.
   Despite the compatibility field name `agentIdentity`, the controller is stored
   in the identity store's `subjects` bucket.

3. **Resource with an existing controller.** Add `controllerIdentityId` to a
   registration input, using an already registered local controller or resource
   ID. The store may contain dedicated controllers in `subjects` and resources
   in `agents`. The new resource gets its own DID/key; the controller signs the
   registration authorization. A locally generated, unregistered identity is
   insufficient. The current Registrar requires the controller registration and
   verification-method binding in its own controller index.

When coding directly, use `new OanSkill(profile).register(input)`. The optional
`controllerIdentity`/`resourceIdentity` accept local SDK identity records for
signing. Never paste keys into chat or put them into a public submission.
If importing a website OAN Identity file, use SDK identity import/conversion
helpers to obtain a validated SDK record; do not assume all wallet JSON formats
are the same as the local store record.

## Register from descriptions and retry safely

Use `draft` with:

```json
{
  "identityDir":".oan-community-identities",
  "text":"A full and truthful description of the resource, its inputs and outputs.",
  "overrides":{
    "name":"My skill",
    "resourceType":"skill",
    "endpoint":"https://your-service.example/skill.json",
    "authorizedDomains":["technology.software_engineering"],
    "capabilityTags":["documentation"]
  }
}
```

`markdown` is also supported. Review the candidate, `missingInputs` and
`qualityIssues`. `draft` contacts the selected Registrar for its DID and creates
local signed material, but sends no registration write. `register-description`
does the same preparation and submits once. Missing fields fail before creating
the resource identity. `register-batch` accepts `{identityDir,items:[...]}` and
records validation/Registrar failures per item while continuing the batch.

To use an existing Markdown file and publish the reviewed draft without creating
another identity:

```powershell
node scripts/oan-community.mjs draft --description resource.md --input metadata.json --output draft.json
node scripts/oan-community.mjs register --input draft.json --output registration.json
```

`metadata.json` uses the description input above, with `overrides` for facts the
file does not contain. Pass the same `--profile` to both commands for third-party
services. `draft.json` includes `data.agentIdentity.id`, `data.identityDir` and
the signed submission. The CLI accepts this full draft result directly. Do not
run `register-description` again merely to submit a reviewed draft. The direct
TypeScript equivalent is `skill.register({submission: draft.data.submission})`.
Expired drafts must be prepared again using `agentIdentityId` and the saved keys.

Both registration workflows accept `controllerIdentityId`; `subjectIdentityId`
is a compatibility alias. When explicitly reusing a resource ID, the original
external controller is resolved from the same local store if omitted; an
explicit conflicting controller fails instead of transferring ownership.

CLI batch items may provide `sourcePath` instead of inline text. A missing file
is recorded as an item failure and processing continues. Batch results retain
each successful `registration` response (including VC) and `agentIdentity`.
`ok:false` / exit code 1 means at least one item was skipped or failed; inspect
the per-item results and retry only unfinished items. `stopOnFailure:true` stops
at the first unsuccessful item; `summary.total` remains the original input count.

Input/output descriptions map to `resourceDescription.inputSchema.description`
and `outputSchema.description`, with use cases in `useCaseExamples`. They are
descriptions, not invented JSON validation schemas. Source URLs are preserved as
implementation links. Unspecified artifact hashes are omitted; the skill does
not download packages or pretend a metadata hash verifies their bytes. The
top-level submission `packageHash` is the protocol's registration binding hash.

For a retry or new version, supply the stored `agentIdentityId` to reuse that
resource explicitly. For the description workflow `reuseAgentIdentity:true`
matches name, type, Registrar routing and controller. It never selects an
unrelated resource just because it is the default identity. A new call without
an explicit ID/reuse can create a new identity; preserve draft results and avoid
blind repeated calls after network uncertainty.

A pre-signed `{submission:...}` is immutable and short lived (normally five
minutes). Submit it unchanged with `register`. If expired or edited, regenerate
proofs with local identities. Changing only hashes invalidates signatures.
After a timed-out write, query the same DID before retrying. POST registration is
not automatically retried. Metadata and control-proof timestamps must match for
Root to verify the metadata hash.

On failure after identity generation, `localIdentity` and `identityDir` identify
the saved keys for diagnosis/retry. Query that DID after a network timeout before
resubmitting. A failure before generation has no identity to report.

## Discovery and resource queries

Search input for `discover`:

```json
{"query":{"query":"帮助审查软件文档的工具","resourceType":"skill","limit":5},"includeExplanation":false}
```

Set `includeExplanation:true` (default) to request optional match explanations.
The server chooses semantic/hybrid/keyword behavior; the current protocol has no
`searchMode` or authorization-domain query field. Resource type, capability tags,
protocol, version and `versionMode` are supported. Do not treat capability tags
as authorization scopes. Search results guide selection; they do not themselves
prove a resource is safe or callable.

Other CLI inputs (`resourceDid` must be the real DID):

| Action | Input | Result |
|---|---|---|
| `query` | `{resourceDid,source:"registrar"}` | Public registration record |
| `query` | `{resourceDid,source:"discovery"}` | Indexed resource package / DID document |
| `list` | `{source:"registrar",limit:20,afterDid:"..."}` | One page with `nextDid`, `hasMore` |
| `list` | `{source:"discovery",limit:20,afterCursor:0}` | One page with `nextCursor`, `nextResourceDid`, `hasMore` |
| `lifecycle` | `{resourceDid}` | Observed registration/publication/discovery progress |
| `credential-status` | `{resourceDid}` | Public registration VC status |
| `credential` | `{resourceDid,identityDir,controllerIdentityId}` | VC after controller signature authorization |

`list` without an input file defaults to one Discovery page. Copy continuation
cursors exactly; `afterCursor` must be a nonnegative safe JSON integer. `null`
cursors from terminal pages are accepted. Do not stringify numeric fields.
Search accepts only the documented fields; for example `capabilityTags` must be
an array of strings, `includeExplanation` a boolean, and `limit` an integer.
`versionMode` is `latest`, `exact`, `constraint`, or `any-retained`; `exact` and
`constraint` require a `version` string.

Additional CLI actions expose existing ordinary-user helpers:

| Action | Example input |
|---|---|
| `capability-tags` | `{"description":"Document review","tags":["software"]}` |
| `suggest-registration` | `{"name":"My tool","description":"Reviews software documents","resourceType":"skill"}` |
| `suggest-query` | `{"query":"软件文档审查"}` |
| `validate` | `{"submission":{...}}` |

Suggestions are optional and require user review; if a third-party node lacks
these routes, supply domains/tags/query manually and continue. `domains` uses
`GET /registration/domain-catalog`, not `/registrar/domains`.

List pages default to 20 and are capped at 100. For Discovery continuation, send
both `afterCursor: nextCursor` and `afterResourceDid: nextResourceDid` when present.
Never omit bounds and collect the full public index by default. An empty search
or unavailable optional Root/CDN endpoint is not proof of failed registration.

Public registration records deliberately redact VC data. Keep the original
registration response. The private VC query uses a fresh timestamp/nonce and
local controller signature; the server enforces its stored access binding.
Current self-controlled and older registrations may not have that binding and
can return 403; the skill does not bypass it. Querying status is not equivalent
to retrieving or cryptographically verifying a VC.

## Verification scope

Run `npm run typecheck`, `npm test` and `npm run build` for local verification.
`npm run check:public` is an opt-in read-only check against official services;
it checks domain catalog, bounded pages, search, detail and credential status.
It also follows one continuation page and exercises tags, registration/query
suggestions, Chinese query explanations and lifecycle observation.
It does not create identities, register test resources or retrieve private VCs.

`validate()` checks structure, metadata consistency and DID-document hashes.
Registration signing uses SDK helpers and the Registrar/Root verify signatures,
routing, domains and controller admission. `verificationPolicy` remains a legacy
profile field; it does not enable a full chain/VC verification engine. No Forum
login, posting, editing or hiding actions are implemented.
