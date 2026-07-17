# Project: CLI API Client Foundation

## Goal

Add the small handwritten HTTP boundary that API-backed Tough Crowd CLI
commands use for authenticated JSON requests.

## Context

The initial public API surface is small. The CLI does not need a generated SDK,
committed OpenAPI copy, contract-sync workflow, or general networking
framework to call it safely.

The app repository remains the source of truth for the supported API and its
OpenAPI document. This repository will handwrite only the request and response
types used by implemented CLI operations. Each operation validates its response
at runtime instead of trusting a TypeScript cast.

The shared client is responsible only for behavior that every request must get
right: the API origin, authorization, client metadata, request IDs, JSON,
timeouts, cancellation, structured errors, and credential redaction.

## Dependencies

This project depends on:

- [`CLI Command Foundation`](../cli-command-foundation/README.md) for package
  version, injected runtime capabilities, cancellation, and process-independent
  tests.
- The app repository's `Shared Product API` project for supported paths,
  structured errors, request IDs, idempotency headers, and client metadata.

The CLI API-key authentication and session-command projects depend on this
boundary.

## Scope

- Parse and validate one canonical API origin.
- Add a handwritten JSON request helper over injected Node `fetch`.
- Accept only relative API paths so callers cannot redirect credentials to a
  different origin.
- Add authorization, content type, request ID, and stable CLI metadata headers.
- Support JSON bodies, optional idempotency keys, cancellation, and a bounded
  timeout.
- Require each API operation to supply a small runtime response decoder.
- Parse the supported API error envelope into one credential-safe CLI error
  shape.
- Distinguish API, network, timeout, cancellation, and malformed-response
  failures where command behavior needs the distinction.
- Add literal tests for URLs, headers, bodies, responses, errors, cancellation,
  origin isolation, and redaction.

## Out Of Scope

- Committing or generating code from OpenAPI.
- Contract provenance, digests, synchronization scripts, or generated-code CI.
- A generated runtime client or separately published SDK.
- Session-specific methods, DTOs, event normalization, or presentation.
- Credential discovery or storage; callers supply authorization to the request
  boundary.
- Automatic retries. Callers may retry explicitly when the product operation
  defines safe behavior.
- SSE parsing or reconnection. Add streaming with `session watch` when its
  actual event contract is ready.
- Response caching, telemetry, update checks, offline state, or a networking
  framework.

## Implementation Shape

Keep the boundary small enough to understand in one sitting:

```text
src/api/
  origin.ts       canonical API-origin parsing
  request.ts      authenticated JSON fetch
  errors.ts       safe failure shape and API error decoding
```

An operation supplies its path, request body, and response decoder:

```ts
requestJson({
  method: "GET",
  path: "/api/example",
  authorization,
  signal,
  decode: decodeExampleResponse,
});
```

This is a responsibility sketch, not a requirement to create separate files
when the implementation is clearer with fewer modules.

## Decisions

- Production API origins require HTTPS. Plain HTTP is allowed only for
  loopback development.
- Origins contain no user info, path, query, or fragment. Requests accept a
  relative path beginning with `/api/` and cannot change the origin.
- Authorization is attached immediately before `fetch` and is never included
  in errors or request diagnostics.
- Redirect behavior must not send authorization to another origin.
- Client metadata includes only CLI name and version plus Node, platform, and
  architecture information.
- Successful responses must use the expected JSON content type and pass the
  operation's decoder.
- API errors retain the bounded code, safe message, HTTP status, request ID,
  and documented field details. Arbitrary response bodies are discarded.
- Bounded JSON requests combine the command abort signal with a request
  timeout. Cancellation does not become an unexpected error.
- The transport does not retry. A later operation can add narrowly scoped
  retry behavior after real usage demonstrates the need.

## Checklist

- [ ] Define and test canonical production and loopback API origins, including
      deceptive invalid inputs.
- [ ] Add the minimal injected fetch and timeout capabilities needed by API
      tests.
- [ ] Implement the handwritten JSON request helper with relative paths,
      authorization, stable client metadata, request IDs, and optional
      idempotency keys.
- [ ] Require an operation-provided runtime decoder and reject unexpected
      content types, invalid JSON, and incompatible success bodies.
- [ ] Parse the supported structured API error envelope into one bounded,
      credential-safe error shape.
- [ ] Map network failure, timeout, cancellation, and malformed responses to
      literal tested failure kinds.
- [ ] Reject or safely handle redirects without sending authorization to a
      different origin.
- [ ] Add adversarial tests proving API keys and authorization headers never
      appear in errors or diagnostics.
- [ ] Document how a new API operation adds handwritten types and a decoder
      from the app's supported API contract.
- [ ] Add a Changeset when the client first becomes part of packaged command
      behavior.
- [ ] Run formatting, lint, typecheck, tests, build, and installed-package smoke
      verification.

## Acceptance Criteria

- API-backed operations use one understandable JSON request boundary instead
  of constructing authenticated requests independently.
- The CLI contains only handwritten types for operations it implements and has
  no build, install, test, or runtime dependency on the app repository.
- A credential supplied for one canonical API origin cannot be sent to another
  origin through a path, redirect, or error flow.
- Successful responses are accepted only after content-type, JSON, and
  operation-specific runtime validation.
- Supported API errors preserve their safe code and request ID while all
  failures exclude credentials and arbitrary response bodies.
- Timeouts and command cancellation stop the request and produce predictable
  command-level behavior.
- The initial client performs no automatic retries and contains no SSE or
  generated-client machinery.
- Formatting, lint, typecheck, tests, build, and installed-package smoke
  verification pass.
