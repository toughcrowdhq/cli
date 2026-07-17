# Project: CLI API Client Foundation

## Goal

Create the generated contract types, HTTP transport, error model, and SSE
parsing boundary shared by every API-backed Tough Crowd CLI operation.

## Context

The app repository owns the supported OpenAPI document and shared product API.
The public CLI repository must consume that contract without importing private
application packages, database schemas, route implementations, or worker code.

Ordinary CLI builds and tests must remain reproducible without a running app
repository or network access. The public OpenAPI document and generated
TypeScript types are therefore committed here and updated through an explicit,
reviewable sync command. Generated types describe the wire contract; small
handwritten adapters own runtime behavior and map wire DTOs into CLI
application models.

The transport must work for bounded JSON requests and long-lived SSE responses,
preserve request IDs and structured errors, enforce origin isolation, support
cancellation, and make retry behavior explicit. It must never log or surface
authorization credentials.

## Dependencies

This project depends on:

- [`CLI Command Foundation`](../cli-command-foundation/README.md) for injected
  runtime capabilities, package version, cancellation, and process-independent
  tests.
- The app repository's `Shared Product API` project for the supported OpenAPI
  document, structured errors, request IDs, pagination, idempotency, client
  metadata, and SSE conventions.

The CLI API-key authentication project and core session-command project both
depend on this project. This project does not depend on the API Key
Authentication Service because its transport is credential-type agnostic.

## Scope

- Commit the supported product OpenAPI document in the CLI repository with
  source and integrity metadata.
- Generate and commit TypeScript wire types deterministically from that local
  contract.
- Add an explicit contract-sync workflow that fetches or accepts a reviewed
  public OpenAPI document and produces an ordinary Git diff.
- Add a small handwritten client over Node's standards-based `fetch` rather
  than importing a private application client or generating runtime SDK code.
- Define and validate canonical API origins, including safe localhost behavior
  for development.
- Add common request headers, JSON encoding and decoding, cancellation,
  timeouts, client metadata, request IDs, idempotency support, and bounded
  retry policy.
- Translate supported API error envelopes and transport failures into typed
  credential-safe CLI errors.
- Parse SSE responses into an asynchronous stream of protocol events without
  coupling the parser to session-domain event types.
- Inject network, timing, randomness, and sleep capabilities needed for
  deterministic tests.
- Add literal contract, transport, retry, error, redaction, and streaming
  tests.

## Out Of Scope

- Authentication commands, API-key storage, or credential precedence.
- Session operations, public `SessionEvent` normalization, reducers, or
  human/JSON/JSONL presentation.
- API key, cookie, OAuth, or other credential validation on the server.
- Automatically changing the public API or opening cross-repository pull
  requests.
- Fetching a contract during ordinary install, build, test, or package use.
- A separately published API SDK package before another supported consumer
  requires one.
- A generated runtime client, private app package dependency, GraphQL client,
  WebSocket abstraction, or general-purpose networking framework.
- Automatic retry of unsafe operations without an idempotency key.
- API response caching, offline session state, telemetry, update checks, or a
  TUI.

## Contract Synchronization

Keep the supported OpenAPI document and generated types in explicit locations
such as:

```text
contracts/
  product-api.openapi.json
  product-api.source.json
src/api/generated/
  product-api.ts
```

The source metadata records the canonical source URL, retrieval time, and
content digest but does not make the network source part of ordinary builds.
The OpenAPI document is public product contract material and may be committed;
it must contain no internal routes, private server schemas, example secrets,
customer data, or infrastructure details.

Use a pinned `openapi-typescript` development dependency for type generation.
Generated files contain a no-hand-edit header and are regenerated from the
committed contract. CI regenerates into a disposable location or verifies a
clean diff so a contract and its generated types cannot drift.

Contract sync is always explicit. It validates the document, verifies that its
servers and paths match the expected Tough Crowd product API, rejects internal
route families, updates the digest, regenerates types, and leaves all changes
for normal human review. It never silently downloads a newer contract during
package installation or execution.

## Transport Decisions

- Use the runtime's injected `fetch` implementation and web-standard
  `Request`, `Response`, `Headers`, and `AbortSignal` types.
- Canonical API origins contain only an allowed scheme, lowercase host, and
  non-default port. Reject user info, query, fragment, and resource paths.
  Require HTTPS except for IP-literal loopback development origins.
- Keep authorization injection at the request boundary. Error objects,
  diagnostics, and test helpers receive redacted request metadata, never raw
  authorization headers.
- Send stable CLI name/version, Node version, platform, and architecture
  metadata. Do not send repository paths, prompts, environment contents, or
  other local context as generic client metadata.
- Decode only documented JSON success media types. Treat invalid JSON,
  unexpected content types, and incompatible success shapes as protocol errors,
  not successful empty responses.
- Preserve structured API error code, safe message, HTTP status, request ID,
  field details, and retry timing when documented. Bound all untrusted strings
  before displaying or retaining them.
- Distinguish API responses, network failures, timeouts, cancellation, and
  malformed protocol responses so command exit mapping remains deliberate.
- Retry only explicitly retryable requests. Safe reads may use bounded retries;
  mutating requests require a stable idempotency key before any retry. Honor
  bounded `Retry-After` values and use injected jitter and sleep.
- A caller creates and retains a mutating operation's idempotency key. The
  transport accepts it but never generates a different key for a retry.
- Bounded requests receive an explicit timeout combined with the process abort
  signal. Streaming requests use cancellation and heartbeat/reconnect policy
  owned by their application operation rather than a normal request timeout.

## SSE Boundary

The generic SSE parser consumes response bytes and yields protocol records:

```text
id
event
data
retry
```

It handles arbitrary UTF-8 and network chunk boundaries, comments and
keep-alives, multiline data fields, blank-line dispatch, byte-order marks, and
the last-event ID rules required by the product stream. It applies explicit
limits to buffered line, event, and data sizes.

The parser does not decode `data` as a session event, reconnect automatically,
reduce session state, or print output. The later session event source validates
the JSON envelope, tracks the durable cursor, and owns reconnection semantics
over this protocol layer.

## Checklist

### Phase 1 — Committed Public Contract

- [ ] Define the committed OpenAPI contract, provenance metadata, and generated
      type locations without including them in the published runtime package.
- [ ] Add a pinned `openapi-typescript` development dependency and deterministic
      offline generation script.
- [ ] Add an explicit contract-sync command that accepts the canonical public
      document, validates it, records its digest, and regenerates types.
- [ ] Reject contracts with unexpected servers, unsupported OpenAPI versions,
      internal route families, private schemas, or missing required product
      conventions.
- [ ] Commit the initial supported product OpenAPI document and generated wire
      types with a no-hand-edit header.
- [ ] Add CI verification that the committed contract, digest, and generated
      types are synchronized without requiring network access.
- [ ] Add literal tests for required public paths and representative forbidden
      internal paths instead of snapshotting the generated document.
- [ ] Document the manual cross-repository update and review flow.

### Phase 2 — Bounded HTTP Transport

- [ ] Define and test canonical API-origin parsing for production HTTPS,
      loopback development, default ports, IPv4, IPv6, and deceptive invalid
      inputs.
- [ ] Define the injected HTTP runtime for fetch, package metadata, time,
      randomness, sleep, and cancellation.
- [ ] Implement JSON request construction with stable headers, client metadata,
      authorization injection, request IDs, and optional idempotency keys.
- [ ] Implement bounded JSON response decoding with documented content-type and
      success-shape checks.
- [ ] Define typed API, network, timeout, cancellation, and protocol failures
      without retaining raw request headers or arbitrary response bodies.
- [ ] Parse and preserve supported error codes, messages, field details,
      request IDs, and bounded retry timing.
- [ ] Implement explicit retry policy for safe reads and idempotency-keyed
      mutations with deterministic backoff, jitter, and cancellation.
- [ ] Ensure retries reuse the original request body and idempotency key and
      never retry a partially consumed non-replayable body.
- [ ] Add literal tests for methods, URLs, headers, bodies, metadata, success,
      every failure category, retry limits, `Retry-After`, and cancellation.
- [ ] Add adversarial redaction tests proving keys and authorization headers do
      not appear in errors, output, or diagnostic objects.

### Phase 3 — SSE Protocol Transport

- [ ] Implement a bounded incremental UTF-8 SSE parser that accepts arbitrary
      byte chunk boundaries.
- [ ] Support comments, keep-alives, blank-line dispatch, multiline data,
      event names, IDs, retry fields, byte-order marks, and end-of-stream
      behavior.
- [ ] Reject or terminate oversized lines, data fields, and buffered events
      with a typed protocol failure.
- [ ] Add the streaming fetch boundary with content-type validation,
      cancellation, response request ID, and last-event-ID request support.
- [ ] Expose parsed protocol events as an `AsyncIterable` without automatic
      JSON decoding, session normalization, reconnection, or rendering.
- [ ] Add literal tests that split multibyte characters and every protocol
      delimiter across different network chunks.
- [ ] Verify consumer cancellation releases the response reader and does not
      leave timers, fetches, or async iterators active.
- [ ] Add a Changeset for the public client foundation when it first becomes
      part of the packaged CLI runtime.
- [ ] Run formatting, lint, typecheck, tests, build, and installed-package smoke
      verification.

## Acceptance Criteria

- The CLI repository contains a reviewable supported OpenAPI document and
  generated TypeScript types that regenerate deterministically without network
  access.
- Ordinary install, build, tests, and CLI execution never fetch a contract or
  read files from the private app repository.
- Contract verification fails for drift, unexpected internal paths, or stale
  generated types with a clear remediation command.
- All API requests use one canonical-origin and transport boundary with stable
  client metadata, request IDs, cancellation, redaction, and typed failures.
- A key supplied for one API origin cannot be sent to a different origin by URL
  joining, redirects, retries, or error handling.
- Unsafe operations are not retried without a stable idempotency key, and every
  retry reuses that key and request body.
- Errors expose only documented bounded details and never include API keys,
  authorization headers, arbitrary response bodies, or local environment data.
- The SSE parser produces the same literal records regardless of byte and UTF-8
  chunk boundaries and enforces bounded memory use.
- SSE iteration responds to cancellation and releases its reader without owning
  session-specific JSON validation, cursor policy, reconnection, or output.
- Authentication and session adapters can consume generated wire types and the
  shared transport without importing application-private code or Commander.
- Formatting, lint, typecheck, tests, build, and installed-package smoke
  verification pass.
