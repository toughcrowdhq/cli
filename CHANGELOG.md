# @toughcrowd/cli

## 0.2.0

### Minor Changes

- f81b771: Add the initial authenticated JSON API client boundary with canonical origin
  validation, credential-safe errors, request metadata, timeout and cancellation
  handling, and runtime response decoding.
- bec3f5b: Add API-key authentication commands with environment-key support, OS credential storage, and safe authentication status output.
- b2fa2dd: Replace pasted API-key login with browser approval using a temporary loopback
  callback and PKCE, then securely store the issued key and report safe
  authentication status without exposing credential material. Point the default
  production client at the deployed `api.toughcrowd.dev` origin.
- 382749a: Replace the initial greeting scaffold with a Commander-based CLI root, stable
  help and version behavior, usage-error handling, injectable runtime streams,
  and abort-aware process wiring.

## 0.1.1

### Patch Changes

- 3e2a812: Normalize the published `toughcrowd` executable metadata.

## 0.1.0

### Minor Changes

- Add the initial `toughcrowd` executable scaffold.
