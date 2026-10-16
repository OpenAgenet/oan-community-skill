# Community registration, discovery and queries

The default gateway `https://www.openagenet.xyz` routes to the official
Registrar and Discovery. No server keys, private indexer or Forum access is needed.

## Running the skill

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
It does not create identities, register test resources or retrieve private VCs.

`validate()` checks structure, metadata consistency and DID-document hashes.
Registration signing uses SDK helpers and the Registrar/Root verify signatures,
routing, domains and controller admission. `verificationPolicy` remains a legacy
profile field; it does not enable a full chain/VC verification engine. No Forum
login, posting, editing or hiding actions are implemented.
