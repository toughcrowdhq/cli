# Project: CLI Session Commands

## Goal

Build the first useful `toughcrowd session` workflow in three independently
shippable phases: read sessions with `list`, create sessions with `new`, then
follow replayable activity with `watch` and `new --watch`.

## Context

The CLI already has browser-approved API-key login, canonical API-origin
resolution, credential selection, a handwritten JSON request boundary,
Commander routing, cancellation, and literal command tests. Session commands
should extend those boundaries instead of adding a second client or process
model.

The product's supported OpenAPI document already includes bearer-authenticated
`GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/{sessionId}`, and
`GET /api/sessions/{sessionId}/events`. The event endpoint is an SSE stream
that replays persisted normalized events after `Last-Event-ID` and then
continues live. The CLI must handwrite and validate the public response shapes;
it must not import types or code from the private app repository.

The canonical namespace is singular and noun-first:

```sh
toughcrowd session list
toughcrowd session new "Fix the flaky checkout test"
toughcrowd session watch <session-id>
```

Each phase should be releasable and dogfoodable before the next phase begins.

## Dependencies

- [`CLI Command Foundation`](../cli-command-foundation/README.md) for Commander,
  `runCli`, injected runtime capabilities, cancellation, and exit handling.
- [`CLI API Client Foundation`](../cli-api-client-foundation/README.md) for
  canonical origins, HTTP metadata, structured errors, runtime decoding, and
  redaction.
- [`CLI Browser API Key Login`](../cli-browser-api-key-login/README.md) for
  origin-keyed credential resolution and bearer authentication.
- The app repository's supported product API contract for session list,
  creation, detail, and event streaming.

## Scope

- Add the singular `session` namespace with `list`, `new`, and `watch`.
- Keep Commander adapters thin over framework-independent application
  operations and handwritten public API clients.
- Reuse the configured API origin and environment-before-keyring bearer
  credential resolution for every session request.
- Add concise append-only human output plus JSON for finite commands and JSONL
  for the event stream.
- Resolve creation repository from `--repo`, then `TOUGHCROWD_REPO`, then a
  recognizable GitHub `origin` remote. Resolve Agent Profile from `--profile`,
  then `TOUGHCROWD_AGENT_PROFILE`; fail with actionable guidance when either
  value remains unresolved.
- Send one generated idempotency key for each `session new` operation.
- Stream normalized product events through an `AsyncIterable<SessionEvent>`
  that accepts an `AbortSignal`, tracks the last sequence, and resumes a
  disconnected stream with `Last-Event-ID`.
- Stop watching on interruption or a terminal session status, without taking
  over the alternate screen, raw terminal mode, cursor, mouse, or scrollback.
- Update user documentation, package smoke coverage, and release notes as each
  phase ships.

## Out Of Scope

- `session show`, `prompt`, `open`, `checks`, `diff`, `evidence`, `cancel`,
  `archive`, or aliases and implicit latest-session selection.
- A full-screen TUI, multi-session dashboard, terminal component framework, or
  interactive session picker.
- Raw provider callbacks, worker logs, `session_log_chunks`, sandbox terminal
  access, or a second logs API. `watch` consumes only the public normalized and
  redacted session event stream.
- Project or user configuration files, named account contexts, multiple API
  origins in one invocation, or general-purpose configuration machinery.
- Repository or Agent Profile discovery through new API endpoints. Add those
  only when a concrete command requires them.
- Automatic creation retries, background daemons, telemetry, event persistence
  on the client, or offline operation.
- Importing generated or handwritten code from the private product repo.

## Command Contracts

### `session list`

```sh
toughcrowd session list [--status <status>] [--repo <owner/name>]
  [--limit <count>] [--cursor <cursor>] [--json]
```

The default request returns one server-defined page in newest-first order.
Human output shows stable, bounded fields: full ID, status, repository, title,
and creation time, followed by a next-cursor hint only when another page
exists. `--json` emits one JSON object containing `sessions`, `counts`, and
`pageInfo`. Empty results are successful and explicit. The initial command
does not silently fetch every page.

### `session new`

```sh
toughcrowd session new <prompt> [--repo <owner/name>] [--profile <profile-id>]
  [--base-branch <branch>] [--title <title>] [--json] [--watch]
```

The prompt is one required positional argument. Repository and Agent Profile
resolution is deterministic and reports the winning non-secret source in
diagnostics when needed. Human output prints the created session's full ID,
status, repository, Agent Profile, and title; `--json` emits the validated
session response. `--watch` is added only in the streaming phase and rejects
`--json`; automation can compose `session new --json` with
`session watch --jsonl` without creating a mixed-output contract.

### `session watch`

```sh
toughcrowd session watch <session-id> [--jsonl]
```

The command replays persisted events from the beginning, then follows live
events. Human output is append-only and renders timestamp, phase/category, and
safe event text with a compact fallback for events without text. `--jsonl`
emits exactly one normalized event object per line and no decorative output.
Keep-alives and SSE control framing are not user events.

The stream reconnects after transient disconnects using the last fully decoded
sequence so events are neither skipped nor intentionally duplicated. It fails
without retrying on authentication, authorization, not-found, client-upgrade,
or malformed-stream errors. `SIGINT` and `SIGTERM` cancel promptly and return
the CLI's interrupt exit code. A successful terminal state returns zero;
`failed`, `cancelled`, or `abandoned` returns the ordinary command-failure exit
code after rendering the terminal event. `new --watch` uses the same operation
and rules after printing the creation summary.

## Checklist

### Phase 1 — Read Sessions

- [x] Add the `session` namespace and literal root, namespace, and `list` help
      tests without changing `auth` behavior.
- [x] Define the smallest handwritten session summary, list envelope, status,
      counts, and pagination types with adversarial runtime decoders.
- [x] Add one reusable authenticated session API runtime that resolves the API
      origin and bearer credential through the existing auth boundaries.
- [x] Implement the list application operation and encode `status`, `repo`,
      `limit`, and opaque `cursor` query values without changing origins.
- [x] Implement bounded human list output, explicit empty output, next-cursor
      guidance, and one stable JSON document for `--json`.
- [x] Add literal command tests for filters, pagination, empty results,
      malformed responses, missing or revoked credentials, API errors,
      cancellation, stdout, stderr, and exit codes.
- [x] Update README examples and the installed-package smoke fixture for
      deterministic bearer-authenticated `session list` behavior.
- [x] Add a Changeset and run the full CLI verification suite before shipping
      the read phase.

### Phase 2 — Create Sessions

- [ ] Add focused non-secret input resolution for repository and Agent Profile
      with literal flag, environment, GitHub `origin`, precedence, and missing
      value tests.
- [ ] Parse GitHub HTTPS and SSH origin remotes without executing repository
      hooks or accepting a non-GitHub remote as a product repository.
- [ ] Define and decode the public create-session request and response without
      expanding the list DTO into the private app's full domain model.
- [ ] Implement `session new` with required prompt, optional repository,
      profile, base-branch, and title inputs.
- [ ] Generate one idempotency key per create operation and preserve it for all
      request attempts made by that operation.
- [ ] Implement bounded human creation output and one stable JSON response for
      `--json`.
- [ ] Add literal tests for argument validation, input precedence, request
      shape, idempotency header, success, conflict, unavailable repository,
      invalid profile, malformed response, cancellation, and redaction.
- [ ] Update README examples and the installed-package smoke fixture for a
      deterministic session creation request.
- [ ] Add a Changeset and run the full CLI verification suite before shipping
      the create phase.

### Phase 3 — Stream Events And Logs

- [ ] Add a fetch-based SSE transport that can send bearer headers, consumes a
      `ReadableStream` incrementally, and closes cleanly on abort.
- [ ] Parse SSE comments, event names, IDs, multiline data, and chunk
      boundaries with bounded buffers and literal malformed-frame tests.
- [ ] Define the normalized public `SessionEvent` model and expose session
      activity as `AsyncIterable<SessionEvent>` with an `AbortSignal`.
- [ ] Replay from the start, retain only the last fully decoded sequence, and
      reconnect transient failures with `Last-Event-ID` and bounded backoff.
- [ ] Handle the public stream control error as terminal and never render
      keep-alives, raw frames, credentials, or redacted payload internals.
- [ ] Add a pure terminal-status reducer that lets `watch` stop and select its
      exit category without coupling event parsing to presentation.
- [ ] Implement append-only human event output and strict one-event-per-line
      JSONL output.
- [ ] Add `session watch <session-id>`, including replay, live delivery,
      reconnect, no-duplicate, already-terminal, failure, cancellation, and
      redaction command tests.
- [ ] Add `session new --watch` by composing the existing creation and watch
      operations; reject its combination with `--json`.
- [ ] Extend the installed-package smoke fixture to exercise deterministic SSE
      replay and terminal completion from the packed executable.
- [ ] Verify list, creation, bearer SSE replay, live delivery, and terminal
      behavior end to end against the local app.
- [ ] Update README and architecture notes, add a Changeset, and run the full
      CLI verification suite before shipping the streaming phase.

## Acceptance Criteria

- The installed CLI exposes `session list`, `session new`, and `session watch`
  with the singular noun-first grammar and literal, stable help.
- Every session request uses the configured canonical API origin, the selected
  bearer credential, public client metadata, cancellation signal, and bounded
  runtime decoding.
- `session list` renders one deterministic page, preserves the opaque cursor,
  and provides a machine-readable JSON envelope without silently fetching more
  pages.
- `session new` resolves only safe creation context, sends a nonempty
  idempotency key, creates one durable cloud session, and prints its full ID.
- `session watch` replays persisted normalized events, continues live, resumes
  transient disconnects from the last sequence, preserves scrollback, and
  stops on terminal status or interruption.
- Human output remains concise; JSON and JSONL contain no decoration; no mode
  exposes API keys, authorization headers, raw provider payloads, or private
  app internals.
- Missing context, invalid input, authentication failures, API failures,
  malformed responses, stream failures, terminal session failures, and user
  interruption return documented nonzero categories with actionable output.
- No phase depends on private app packages, database schemas, workers, sandbox
  providers, or source files.
- Each phase passes format checking, lint, typecheck, tests, build, and the
  installed-package smoke test before release.

## Notes

2026-07-18: Chose three release slices in dependency order: list first, create
second, then replayable streaming. The first streaming surface is `watch` over
normalized public session events; a separate raw `logs` command is deferred
because the product API already carries safe log-like activity as events and
does not expose raw runtime logs as a public contract.
