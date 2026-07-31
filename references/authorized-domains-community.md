# Authorized Domains For Community Workflows

Use this reference for community-facing registration and Discovery tasks.

## Registration Guidance

- Treat `authorizedDomains` as authorization data, not as `capabilityTags`.
- A final resource registration must include
  `didDocument.oanMetadata.authorizedDomains`.
- `[]` means no authorization and is not publishable for ordinary community
  registration.
- `["*"]` means all-domain resource scope. Use it only when the selected
  Registrar or user policy intentionally classifies the resource as all-domain.
- Concrete domains must be sorted, unique, and not mixed with `*`.
- Concrete domains must be canonical machine identifiers from the Registrar's
  domain set. Keep Chinese or mixed-language material in resource descriptions,
  examples, use cases, or supplemental capability tags, not in
  `authorizedDomains`.
- Parent domains may cover child domains. If a Registrar is authorized for a
  parent domain, it may accept resources in covered child domains according to
  the active OAN service policy.
- Do not infer domains from `did:oan` semantic code.
- Do not rely on capability tags to satisfy authorization.

## Practical Workflow

1. Ask the user or registration UI for the intended domain list.
2. If the user is unsure, ask the Registrar workflow to recommend or approve a
   concrete list before final submission.
3. Put the same list in the resource DID Document and generated package
   metadata.
4. Keep capability tags focused on search, ranking, and product description.
5. When a Registrar rejects the submission, map the error:
   - `resource_domains_required`: add explicit non-empty domains.
   - `invalid_authorized_domains`: fix wildcard mixing, ordering, duplicates,
     or malformed values.
   - `unauthorized_domains`: choose a Registrar authorized for the resource
     domains or select domains covered by the current Registrar.

## Discovery Guidance

- Discovery nodes only expose resources within their governed authorization
  scope.
- Discovery nodes do not run trust-indexer by default in the current model.
  Domain filtering should be treated as Discovery's local enforced state,
  derived from official governance/Root workflows or an explicitly configured
  governance read source.
- A good semantic match can still be absent when the resource is outside the
  Discovery node's authorized domains.
- Query terms and `capabilityTags` help ranking and filtering; they do not
  expand what the Discovery node is authorized to return.
- If expected resources are missing, inspect both lifecycle visibility and the
  Discovery node's reported `authorizedDomains`.
- When testing domain-specific behavior, choose real authorized-domain values.
  Do not use endpoint hostnames or capability-tag-like strings as
  `authorizedDomains`.

## Governance-State Reads

- The trust-indexer consumed by an official Root node is Root-private unless
  explicitly deployed as a public read service.
- Community workflows may read governance state only through an explicit public
  or user-provided trust-indexer endpoint.
- Do not tell community users that Registrar or Discovery includes indexer by
  default.
