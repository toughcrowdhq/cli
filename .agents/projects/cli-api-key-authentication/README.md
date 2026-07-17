# Project: CLI API Key Authentication

## Goal

Implement `toughcrowd auth login` and `toughcrowd auth status` with an API key
stored for one canonical API origin or supplied through
`TOUGHCROWD_API_KEY`.

## Context

The web application creates an account API key and displays it once. The CLI
opens that page, reads the pasted key without echoing it, validates it, and
stores it in the operating-system credential store.

Production and local-development credentials are isolated by canonical API
origin. `TOUGHCROWD_API_KEY` is the simple non-interactive path and always
takes precedence over stored credentials for the current process.

The first implementation supports the secure primary path only. If the
operating-system credential store is unavailable, interactive login fails with
an actionable explanation; permission-restricted file storage can be added
later if dogfooding shows it is needed.

## Dependencies

This project depends on:

- [`CLI Command Foundation`](../cli-command-foundation/README.md) for Commander,
  `runCli`, injected process capabilities, output separation, cancellation,
  and tests.
- [`CLI API Client Foundation`](../cli-api-client-foundation/README.md) for the
  canonical API origin, handwritten JSON transport, structured errors, client
  metadata, cancellation, and redaction.
- The app repository's API-key authentication endpoints for validating a key
  and returning bounded identity information.

The first session commands depend on this project for credential resolution.

## Scope

- Add `toughcrowd auth login` and `toughcrowd auth status`.
- Resolve and validate the API and web origins.
- Open the web API-key page when possible and always print its URL.
- Read the key through a hidden interactive prompt; never accept it in an
  argument or option.
- Handwrite the identity request and response types and runtime decoder.
- Validate the key before storing it.
- Store one format-tagged API-key credential per canonical API origin in the
  operating-system credential store.
- Resolve `TOUGHCROWD_API_KEY` before stored credentials and never persist an
  environment key.
- Confirm before replacing an existing stored key.
- Report bounded identity, origin, credential source, key name, and expiration
  without exposing the key.
- Add literal command, origin-isolation, storage, cancellation, and redaction
  tests.

## Out Of Scope

- Creating, listing, revoking, or changing API keys from the CLI.
- OAuth, browser callbacks, device authorization, or token refresh.
- Multiple accounts for one API origin.
- Permission-restricted file credential storage. Use
  `TOUGHCROWD_API_KEY` when the OS credential store is unavailable.
- Local logout or credential removal.
- API keys in command arguments, options, URLs, project files, visible prompts,
  logs, or ordinary output.
- Project configuration, repository detection, Agent Profile selection,
  session commands, telemetry, or a TUI.

## Command Behavior

### `auth login`

1. Resolve the canonical API and web origins.
2. Open and print the web API-key page.
3. Read a key through a hidden TTY prompt.
4. Validate it with the handwritten identity API operation.
5. Confirm replacement when a stored credential already exists.
6. Store it only after validation and confirmation succeed.
7. Print the safe authenticated identity and origin.

Non-TTY login fails with guidance to use `TOUGHCROWD_API_KEY`. Failed
validation or cancellation leaves any existing credential unchanged.

### `auth status`

Resolve the environment key first, otherwise the stored credential for the
resolved canonical API origin, and validate the selected key. Human and JSON
output contain only safe identity and credential metadata. The command returns
success only when the selected credential is valid; missing or invalid
credentials produce a nonzero exit as normal command failures, not unexpected
exceptions.

## Credential Boundary

```text
TOUGHCROWD_API_KEY
  > stored credential for the resolved canonical API origin
  > authentication required
```

Store a small tagged record so a future credential kind is never
misinterpreted as an API key:

```text
formatVersion: 1
kind: api-key
apiOrigin: <canonical origin>
apiKey: <secret>
```

Unknown kinds or newer formats fail safely and are not rewritten. Credential
store service and account identifiers are derived from the canonical origin
and contain no secret material.

## Checklist

- [ ] Add the `auth` namespace with thin `login` and `status` Commander
      adapters over ordinary authentication functions.
- [ ] Resolve the API and web origins and test production, loopback, override,
      and deceptive inputs literally.
- [ ] Add environment-before-storage credential resolution for the exact API
      origin, retaining only safe source metadata.
- [ ] Choose an operating-system credential-store dependency that supports the
      package's Node and platform targets.
- [ ] Implement the small format-tagged stored credential record and reject
      unknown kinds and newer versions without rewriting them.
- [ ] Add an injected credential-store boundary so tests never access the
      developer's real credentials.
- [ ] Add the handwritten identity API operation and runtime response decoder.
- [ ] Define literal behavior for valid, missing, invalid, expired, and revoked
      keys plus network failure and cancellation.
- [ ] Add hidden TTY input that restores terminal state after success, failure,
      cancellation, `SIGINT`, and `SIGTERM`.
- [ ] Implement login with browser opening, printed fallback URL, hidden input,
      validation, replacement confirmation, and store-after-success behavior.
- [ ] Implement status with concise human output and bounded JSON output.
- [ ] Verify that changing the API origin never loads or sends a credential
      stored for another origin.
- [ ] Add adversarial command tests proving keys do not appear in stdout,
      stderr, errors, diagnostics, or package-smoke output.
- [ ] Update README authentication and `TOUGHCROWD_API_KEY` documentation.
- [ ] Add a Changeset and a deterministic installed-package authentication
      smoke check.
- [ ] Run formatting, lint, typecheck, tests, build, and installed-package smoke
      verification.

## Acceptance Criteria

- `auth login` reads a key only through a hidden TTY prompt, validates it, and
  stores it only after successful validation and any required replacement
  confirmation.
- `TOUGHCROWD_API_KEY` bypasses stored credential reads and is never persisted.
- Stored credentials are selected only by exact canonical API origin.
- An unavailable OS credential store produces actionable guidance to use the
  environment variable and never silently writes a plaintext file.
- `auth status` reports only bounded safe identity, origin, source, key name,
  and expiration information.
- `auth status` exits successfully only for a valid selected credential and
  exits nonzero when credentials are missing or invalid.
- Unknown stored formats fail without destructive rewrite.
- Keys never appear in arguments, options, URLs, stdout, stderr, errors,
  diagnostics, or tests.
- Tests exercise repeated `runCli` calls without global process mutation,
  network access, or the developer's credential store.
- Formatting, lint, typecheck, tests, build, and installed-package smoke
  verification pass.
