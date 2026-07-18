# Project: CLI Browser API Key Login

## Goal

Replace the current paste-based `toughcrowd auth login` with browser approval,
a temporary loopback callback, and automatic storage of the returned Tough
Crowd API key.

## Context

The CLI already resolves API keys, validates them, and stores them in the
operating-system credential store. Its current login command opens Settings and
asks the user to paste a key. Delete that login flow rather than maintaining it
as a fallback.

The replacement binds an operating-system-assigned port on `127.0.0.1`, creates
state and a PKCE verifier/challenge, starts authorization through the configured
API, and opens the exact approval URL returned by the server. The browser sends
a short-lived code to the listener after approval. The CLI validates state,
exchanges the code and verifier for an ordinary `tc_key_...` API key, and stores
it through the existing keyring boundary.

The companion app project owns the public API contract, short-lived
persistence, browser approval, and key issuance. This project owns the
listener, browser launch, exchange, credential write, and command behavior.

## Scope

- Make browser-approved loopback login the only interactive `auth login` flow.
- Bind only `127.0.0.1` with port `0` and the fixed `/callback` path.
- Generate state and PKCE `S256` values with Node's built-in cryptography.
- Start authorization through the configured API and open its returned URL.
- Accept one valid callback, reject unrelated requests, and close the listener
  on every terminal outcome.
- Exchange the code only after state validation, then write the returned API
  key to the existing origin-keyed credential record.
- Replace an existing stored credential only after the new login succeeds; do
  not ask for separate replacement confirmation.
- Use the bearer-capable `/api/me` operation for `auth status`.
- Keep `TOUGHCROWD_API_KEY` as the non-persistent automation override.
- Remove manual input, `TOUGHCROWD_WEB_ORIGIN`, the CLI-specific identity path,
  and their implementation, tests, and documentation.

## Out Of Scope

- Manual API-key entry, `auth login --manual`, or another fallback login mode.
- Refresh tokens, access-token expiry, OAuth scopes, third-party clients,
  discovery documents, OpenID Connect, or a general OAuth library.
- Device polling, remote-browser login, QR codes, custom URI schemes, fixed
  ports, `localhost`, or non-loopback listeners.
- Plaintext or project-local credential storage.
- API-key creation, revocation, or management commands beyond receiving and
  storing the approved key.
- Automatic browser-tab closure or browser automation.

## Command Behavior

`toughcrowd auth login`:

1. Resolve the canonical API origin and bind `127.0.0.1:0`.
2. Generate state plus a PKCE verifier and `S256` challenge.
3. Start authorization with the callback URI, challenge, state, and a bounded
   client label.
4. Print and attempt to open the server-provided approval URL.
5. Wait until approval, denial, expiry, cancellation, or timeout.
6. Validate the callback path and state, then exchange the code and verifier.
7. Store the API key for the exact API origin, replacing any prior stored key.
8. Print bounded authenticated identity and key metadata.

If browser opening fails, print the URL and continue waiting. If the listener
cannot bind, fail with guidance to use `TOUGHCROWD_API_KEY` for automation. No
failed or cancelled login changes the existing stored credential.

`toughcrowd auth status` keeps environment-before-keyring resolution and reads
bounded identity through `/api/me`. It never opens a browser or listener.

## Security Decisions

- Bind the listener before opening the browser. The callback URI is exactly
  `http://127.0.0.1:<port>/callback`.
- Require the expected method, host, path, state, and query shape before
  completing login. Unrelated requests do not terminate the listener.
- Use at least 256 bits of cryptographically secure randomness for state and
  the PKCE verifier; always use `S256`.
- Never put the API key in a browser URL, listener response, terminal output,
  error, or diagnostic.
- Return only a fixed safe browser message after a valid callback; never echo
  code, state, verifier, key, or raw server errors.
- Keep the verifier and returned API key only in memory until exchange and
  keyring storage complete.
- Trust only the configured API origin for the approval URL and exchange.

## Checklist

### Authorization Flow

- [x] Add state and PKCE helpers with literal cryptographic-shape tests.
- [x] Add an injected loopback listener that binds `127.0.0.1:0`, exposes the
      callback URI, validates requests, returns fixed safe HTML, and closes
      idempotently.
- [x] Add disposable real-loopback tests for method, path, host, state,
      single-completion, abort, timeout, and port release.
- [x] Add authorization-start and code-exchange operations using the existing
      API request boundary and bounded runtime decoders.
- [x] Change identity validation from `/api/cli/auth/identity` to `/api/me`.

### Command Replacement

- [x] Replace `auth login` with bind, start, open, wait, exchange, store, and
      safe success output.
- [x] Preserve the old stored key until the new key is successfully exchanged;
      then replace it without a second confirmation.
- [x] Close the listener for success, denial, expiry, exchange failure, timeout,
      SIGINT, and SIGTERM while letting unrelated requests keep waiting.
- [x] Remove the hidden key prompt, manual-login code, `TOUGHCROWD_WEB_ORIGIN`,
      and the obsolete CLI identity client.
- [x] Add literal command tests for success, replacement, denial, timeout,
      cancellation, listener failure, browser-open failure, and repeated
      in-process invocation.
- [x] Add redaction tests proving code, state, verifier, and API key material do
      not appear in output or errors.

### Documentation And Verification

- [ ] Update README and `.agents/architecture.md` to describe browser-only
      interactive login and the single API-origin environment contract.
- [ ] Add a Changeset for the login and environment-contract change.
- [ ] Update the installed-package smoke test with deterministic injected
      browser, network, listener, and credential-store boundaries.
- [ ] Run format, lint, typecheck, tests, build, and package smoke checks.
- [ ] Verify the complete flow against the local app before release.

## Acceptance Criteria

- `toughcrowd auth login` opens browser approval and stores a working key
  without displaying, copying, pasting, or prompting for key material.
- The listener uses only a temporary IPv4 loopback port and releases it after
  every terminal outcome.
- Wrong-state callbacks and codes without the PKCE verifier cannot alter stored
  credentials.
- Failed, denied, expired, or cancelled login leaves the prior key unchanged;
  successful login replaces it.
- The API key appears only in the exchange response and keyring write path.
- `TOUGHCROWD_API_KEY` remains runtime-only and takes precedence over storage.
- `auth status` uses `/api/me` and reports only safe identity, origin, source,
  and key name.
- No manual interactive login path or web-origin configuration remains.
- The packaged executable behaves the same as source execution and has no
  dependency on the private app repository.

## Notes

2026-07-18: Browser-approved loopback login with PKCE replaces manual API-key
entry. Device polling and general OAuth machinery remain deferred.
