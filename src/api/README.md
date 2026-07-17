# API Operations

Add API-backed CLI behavior through `requestJson` instead of constructing
authenticated requests in command adapters.

For each operation:

1. Handwrite only the request and response types that operation needs.
2. Add a small runtime decoder that accepts `unknown` and returns the typed
   response or throws when the shape is unsupported.
3. Call `requestJson` with a `/api/` path, supplied authorization, optional
   idempotency key, command `AbortSignal`, and the operation decoder.
4. Switch on `ApiClientError.kind` for command behavior. Do not include API
   keys, authorization headers, raw response bodies, or arbitrary diagnostics in
   user-facing errors.

The app repository and its supported public API contract remain the source of
truth for paths and payloads. This package keeps a small handwritten boundary
for the operations it implements.
