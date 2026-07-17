# Project: CLI API Key Authentication

## Goal

Implement `toughcrowd auth login` and `auth status` using account-owned API
keys, origin-scoped credential storage, and the `TOUGHCROWD_API_KEY`
environment override.

## Context

The service displays an API key once and stores only its verifier. The CLI must
let an interactive user paste that key without echoing it, validate it before
storage, and retrieve it for later commands without placing it in command-line
arguments, project files, logs, or ordinary output.

One active account is supported per canonical API origin. Production and local
development credentials may coexist, but a key stored for one origin must
never be sent to another. Environment keys are intentionally ephemeral and
take complete precedence over stored credentials for the current process.

The operating-system credential store is the default. An explicit
permission-restricted file fallback is available for environments without a
usable credential service, but the CLI never silently downgrades storage.

## Dependencies

This project depends on:

- [`CLI Command Foundation`](../cli-command-foundation/README.md) for Commander
  routing, `runCli`, injected runtime capabilities, output separation, exit
  handling, and cancellation.
- [`CLI API Client Foundation`](../cli-api-client-foundation/README.md) for
  canonical API origins, generated wire types, shared HTTP transport,
  structured errors, client metadata, retries, cancellation, and redaction.
- The app repository's `API Key Authentication Service` project for API key
  verification and bounded identity endpoints.
- The app repository's `Shared Product API` project for the authenticated
  principal, structured errors, request IDs, and supported client metadata.

The later core session-command project depends on this project and the shared
product session API.

## Scope

- Add the `auth login` and `auth status` command family.
- Reuse the shared canonical API origin and resolve the web origin used by
  authentication.
- Read an API key through a hidden interactive prompt without accepting it as a
  positional argument or command-line option.
- Open the web API-key settings page when possible and always print a copyable
  fallback URL.
- Validate a submitted key against the resolved API origin before storing it.
- Store one tagged, format-versioned API-key credential per canonical API
  origin in the operating-system credential store.
- Add an explicit permission-restricted user-level file fallback without
  storing credentials in a repository.
- Resolve `TOUGHCROWD_API_KEY` before stored credentials and keep environment
  keys process-only.
- Report safe identity, origin, credential source, key name, and expiration
  information through `auth status`.
- Add redaction, literal-output tests, and installed-package verification for
  the authentication commands.

## Out Of Scope

- API key creation, listing, revocation, or expiration changes from the
  terminal; those operations initially live in the web application.
- Local credential removal. Re-running `auth login` may replace the stored key
  only after explicit interactive confirmation.
- OAuth, browser callbacks, device authorization, access-token refresh, or
  multiple credential types beyond the format tag reserved for migration.
- Password entry or browser-session cookie import.
- Multiple accounts for one API origin or directory-selected identity.
- Project configuration, repository detection, Agent Profile selection, or
  session commands.
- Persisting, refreshing, or otherwise modifying an API key supplied through
  `TOUGHCROWD_API_KEY`.
- A command-line `--api-key`, `--token`, or equivalent secret-bearing option.
- Shell completion, update checks, telemetry, or a TUI.

## Command Behavior

### `auth login`

`auth login` is interactive and requires a TTY unless a future explicit secure
input mechanism is approved. It:

1. Resolves and canonicalizes the API and web origins.
2. Opens the web API-key settings page when browser launching is available.
3. Prints the same HTTPS URL so the flow works when automatic opening fails.
4. Reads the complete key through a hidden prompt.
5. Validates the key and reads its bounded identity from the API origin.
6. Stores the tagged credential only after validation succeeds.
7. Prints the authenticated account, API origin, key name, expiration, and
   storage backend without printing the key.

If a stored credential already exists, login must not overwrite it without an
explicit interactive confirmation. A failed validation leaves the existing
credential unchanged.

### `auth status`

`auth status` applies normal credential precedence and validates the selected
key. Human output identifies the API origin, account, source (`environment`,
`credential-store`, or `file`), key name, and expiration. JSON output returns a
bounded documented object containing the same safe facts.

No credential is a normal unauthenticated state, not an internal exception.
The command returns success only when the selected credential is valid.

## Credential Resolution And Storage

Credential resolution is:

```text
TOUGHCROWD_API_KEY
  > stored credential for the exact canonical API origin
  > unauthenticated
```

Canonical origins include scheme, lowercase host, and non-default port. They
exclude user info, query, fragment, and resource paths. Production requires
HTTPS. Plain HTTP is allowed only for loopback local development. The resolver
must reject deceptive or unsupported origins rather than normalizing them into
an allowed destination.

The stored secret uses an envelope such as:

```text
formatVersion: 1
kind: api-key
apiOrigin: <canonical origin>
apiKey: <secret>
```

The storage service and account key are derived deterministically from the
canonical origin without placing secret material in identifiers. Unknown
format versions or credential kinds fail safely and are never rewritten by an
older CLI.

The OS credential service is the default. The implementation dependency must
be evaluated for current Node support, macOS Keychain, Windows Credential
Manager, Linux Secret Service behavior, prebuilt artifact availability,
package provenance, startup cost, and future standalone packaging.

The file fallback requires explicit selection after a visible warning. It uses
the platform-appropriate user data directory, creates parent directories with
user-only access, writes atomically, uses mode `0600` on Unix, rejects unsafe
symlinks and unexpected ownership where the platform exposes it, and preserves
unrecognized newer formats. It never writes beneath the current repository.

## Checklist

### Phase 1 — Authentication And Origin Boundaries

- [ ] Add the `auth` namespace and `login` and `status` Commander adapters over
      framework-independent authentication operations.
- [ ] Reuse the shared canonical API-origin value and define the corresponding
      web origin with literal valid, invalid, and deceptive-input tests.
- [ ] Add the API-key credential resolver with environment-before-storage
      precedence and source metadata.
- [ ] Add the bounded identity endpoint adapter over the shared API transport
      and generated wire types.
- [ ] Send CLI name, version, runtime, and platform metadata without including
      key material in the user agent, URL, or diagnostics.
- [ ] Add authorization-header redaction before errors, request diagnostics, or
      injected logging can observe request details.
- [ ] Define literal success, unauthenticated, invalid-key, expired-key,
      revoked-key, unreachable-service, and interrupted exit behavior.
- [ ] Verify that an API URL override never loads or sends a key stored for a
      different canonical origin.

### Phase 2 — Credential Storage

- [ ] Evaluate and record the operating-system credential-store dependency
      against supported platforms, Node versions, package provenance, and
      distribution constraints.
- [ ] Define the tagged, format-versioned stored credential envelope and reject
      unknown kinds or newer versions without rewriting them.
- [ ] Implement the injected credential-store interface and production OS
      credential-store adapter.
- [ ] Add literal tests for read, create, replace confirmation, unavailable
      store, locked store, and unknown-format behavior.
- [ ] Implement the explicit user-level file fallback with platform paths,
      atomic replacement, permissions, ownership checks where available, and
      symlink rejection.
- [ ] Test the file fallback against real disposable directories and literal
      modes and contents rather than mocking filesystem operations.
- [ ] Ensure concurrent CLI processes cannot truncate, partially replace, or
      silently downgrade the same stored credential.
- [ ] Ensure storage errors never include the submitted key or serialized
      credential envelope in their messages.

### Phase 3 — Authentication Commands

- [ ] Add an injected hidden-input capability that restores terminal state on
      success, validation failure, cancellation, `SIGINT`, and `SIGTERM`.
- [ ] Implement interactive login with browser opening, fallback URL, hidden
      input, remote validation, safe replacement confirmation, and storage only
      after success.
- [ ] Reject non-TTY login with an actionable instruction to use
      `TOUGHCROWD_API_KEY` for non-interactive execution.
- [ ] Implement status with literal human output and a bounded stable JSON
      representation containing no key or verifier fields.
- [ ] Add command-level tests for stdout, stderr, exit codes, browser failure,
      hidden input, replacement, every credential source, origin isolation,
      API errors, cancellation, and redaction.
- [ ] Update public README authentication examples and environment-variable
      documentation using `TOUGHCROWD_API_KEY` exclusively.
- [ ] Add a Changeset for the authentication command family and public
      environment contract.
- [ ] Update installed-package smoke verification with a deterministic
      unauthenticated status check that does not access real user credentials.
- [ ] Run formatting, lint, typecheck, tests, build, and installed-package smoke
      verification.

## Acceptance Criteria

- `auth login` accepts a key only through a hidden TTY prompt, validates it
  against the selected API origin, and never stores an invalid key.
- No command accepts an API key in an argument, option, URL, project file, or
  ordinary visible prompt.
- Production uses the operating-system credential store unless the user
  explicitly accepts the permission-restricted file fallback.
- Production and local-development credentials coexist without either key ever
  being sent to the other's origin.
- `TOUGHCROWD_API_KEY` completely bypasses stored credential reads and remains
  process-only.
- Human and JSON status output identify only safe account, origin, source, key
  name, and expiration facts and return a nonzero exit for unauthenticated or
  invalid credentials.
- Unknown credential formats fail safely without destructive rewrite or
  downgrade.
- Keys never appear in stdout, stderr, errors, logs, test snapshots, process
  arguments, environment diagnostics, or package-smoke output.
- Literal command tests exercise repeated `runCli` calls without global process
  mutation or access to the developer's real credential store.
- The packed package exposes only `toughcrowd`, and formatting, lint, typecheck,
  tests, build, and installed-package smoke verification pass.
