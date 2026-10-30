# CLI Telemetry Contract and Design

This is the proposed client-facing contract carried over from the app project.
Only public protocol and client behavior are specified here; server operations
remain owned by the app repository.

## Collection and lifecycle

Use `cli.command.started` and `cli.command.finished`. Finished carries outcome
`success`, `failure`, or `canceled`; a separate error event would double-count
the same command failure. Generate invocation and event UUIDs in memory.

Resolve command names from the registered command grammar, never from untrusted
argv strings. Examples: `session list`, `session create`, `auth login`. Cover
recognized-command validation before action execution. Help/version, unknown
commands, and startup failures before the reporter exists are excluded.

Send start asynchronously as soon as the command is resolved; send terminal at
the common outcome boundary. At most two single-event requests per invocation,
no sampling, no heartbeat. A long-running command remains started until it exits.
Durations use a monotonic clock, independent of client wall-clock time.

Expected usage/authentication/permission failures remain visible but not defect
alerts. Network and timeout failures are actionable warnings. API 5xx, malformed
responses, local I/O failures, and unexpected exceptions are actionable errors.
Other API codes use an explicit classification table; unknown codes stay visible
with conservative warning severity. Cancellation is neither a defect nor success.


Error kinds are `usage`, `authentication`, `permission`, `api`, `network`,
`timeout`, `malformed-response`, `local-I/O`, and `unexpected`. These exact
tokens must be reconciled with the server schema before release. Cancellation
uses outcome `canceled` and carries no error object.

## HTTP envelope

POST to the selected API origin at `/api/client-logs` with JSON:
`{ "source": "cli-client", "entries": [<event>] }`.
Exactly one entry per request in v1. Maximum serialized UTF-8 request size:
16 KiB. Enforce the size before sending; omit optional frames first, and drop
the report if required fields still cannot fit. Never truncate IDs or codes
into misleading values. Optional fields are omitted rather than null.

Success is HTTP 202 with `{ "accepted": 1 }` after sink acceptance. Structured
400/413/429/503 responses represent invalid input, oversize, limits, or temporary
unavailability. Any rejection, unexpected response, or network failure silently
drops the report. The CLI must not rely on receiving a particular error shape.

The server uses source to select a schema and destination, not to establish
identity. Existing browser envelopes omit source or declare web-client; the CLI
must never use that shape as a fallback. Strict CLI schemas reject unknown fields.

## Transport and attribution
Use the existing origin selection and relative-path rules. No redirects and no
fallback to production when a custom/local origin is selected. Transport bypasses
normal command-error reporting to prevent recursion. Each send has a 500 ms
deadline; finalization has a single 500 ms total budget for all in-flight sends,
then aborts them and clears resources. Use an independent bounded flush signal
after command cancellation. Credential access for telemetry shares that budget;
reuse an already resolved credential whenever possible. Never initiate login.
Do not introduce extra blocking keychain access on the command path.

No retries, on-disk queue, or telemetry warnings in normal output. `202` does not
mean exactly-once storage. Deduplicate analysis by event/invocation IDs; no server
deduplication table. Preserve current unexpected-error output and exit semantics.


Proposed collection default is enabled. `TOUGHCROWD_TELEMETRY=0` or
`DO_NOT_TRACK=1` disables reporting before telemetry-specific credential lookup,
event collection, or network I/O. A command may still perform its own normal
authentication and API work.

Use an already resolved, origin-scoped bearer credential if available within the
budget. Honor normal environment-over-keychain precedence. Anonymous requests
are valid; do not invent a device ID or block reporting to force authentication.
No cookies. Valid credentials permit server-derived account attribution;
missing/invalid credentials remain anonymous. Server infrastructure failures may
reject ingestion. Do not send an account ID or repeat credential resolution
in response to rejection.

## Client event fields

Optional fields are omitted, not null. No arbitrary context object is accepted.

| Field | Type / bound | Owner and meaning |
| --- | --- | --- |
| schemaVersion | integer, exactly 1 | Client contract version |
| event | two-value enum | Client lifecycle event |
| eventId, invocationId | UUID | Client event and command correlation |
| clientTime | ISO UTC timestamp, ≤40 chars | Client occurrence time; untrusted |
| cliVersion | string ≤64 | Package version, no build path |
| nodeVersion | string ≤32 | Runtime version |
| platform | enum | darwin/linux/win32/other |
| arch | enum | x64/arm64/other |
| command | canonical tokens, ≤120 chars | Registered command, no arguments |
| executionContext | enum | ci/interactive/noninteractive; no provider/job IDs |
| outcome | success/failure/canceled | Finished only |
| durationMs | nonnegative finite integer | Finished only; monotonic duration |
| exitCode | integer 0–255 | Finished only; actual CLI result |
| error.kind | classification enum above | Failed outcomes only |
| error.code | safe token ≤80 | Allowlisted diagnostic code, otherwise unknown |
| error.name | safe token ≤80 | Allowlisted exception class, otherwise Error |
| error.frames | ≤10 objects | Optional package-only stack frames |
| error.frames[].file | package-relative path ≤200 | Only CLI package files |
| error.frames[].line, column | positive integers | Optional source positions |
| error.frames[].function | safe registered token ≤120 | Optional; omit unsafe names |
| api.method | HTTP method enum | Optional failed request context |
| api.route | registered template ≤160 | E.g. `/api/sessions/:sessionId`, never actual URL |
| api.status | integer 100–599 | When response received |
| api.requestId | validated token ≤80 | Failed business request, not telemetry POST |

Started forbids terminal/error/API fields. Success and canceled forbid error/API
fields. Failure requires error.kind/code/name; frames and API context are optional.
No raw exception message, error cause object, response body, headers, query string,
repository/session identifiers, working directory, or environment variable values.
Use fixed diagnostic codes to preserve meaning without messages. Strip the stack
header and external frames; parse paths against the installed CLI package root.
Discard frames that cannot be safely normalized; never send raw stack text.


The event must never contain server-owned `recordVersion`, `source`,
`environment`, `receivedAt`, `ingestionRequestId`, `identityKind`, `userId`,
`clientLevel`, `actionable`, or `errorFingerprint`. Source belongs only in the
request envelope. Severity, identity, fingerprint, and normalization are server work.

## Example request

```json
{
  "source": "cli-client",
  "entries": [{
    "schemaVersion": 1,
    "event": "cli.command.finished",
    "eventId": "379097f2-bdf2-4ace-b60a-815d94cc0339",
    "invocationId": "a2417495-daa6-4c57-89fb-dcaec3a32b42",
    "clientTime": "2026-10-30T18:00:00.000Z",
    "cliVersion": "0.8.0",
    "nodeVersion": "22.14.0",
    "platform": "darwin",
    "arch": "arm64",
    "command": "session list",
    "executionContext": "interactive",
    "outcome": "failure",
    "durationMs": 842,
    "exitCode": 1,
    "error": {
      "kind": "malformed-response",
      "code": "response-schema-invalid",
      "name": "ApiClientError"
    },
    "api": {
      "method": "GET",
      "route": "/api/sessions",
      "status": 200,
      "requestId": "business-request-example"
    }
  }]
}
```

## Compatibility and deployment

Released schemas are immutable. With strict validation, adding a transmitted
field or changing meaning requires a new schemaVersion. New canonical command
names within the existing grammar do not. Server readers deploy before writers;
readers for supported CLI versions normalize into server-owned record versions.

The ingestion endpoint stays outside the product API's hard CLI upgrade gate,
so the CLI can report a business `client-upgrade-required` failure as an expected
error. This does not bypass product API restrictions. Older servers may reject
CLI envelopes; drop those reports within the same deadline without fallback,
retry, or changing command behavior. Schema support may be retired after the
corresponding CLI support window, by an explicit server support decision.

Release order: app ingestion → explicit web source verified → CLI release.
No release flag; users can immediately opt out and maintainers can release a
patch disabling the reporter if it causes regressions.

## Operator context and limitations

The server stores CLI events separately from browser logs with proposed 30-day
retention and operator-only access. Public docs disclose authenticated account
attribution and anonymous collection. No AWS SDK or credentials belong in the CLI.

Operators use invocation IDs, failed business request IDs, version, and error
groups to investigate and compare fixes. Two lifecycle events are one command.
Observed failure rates exclude cancellation; anonymous reports cannot identify
unique users. Offline use, opt-out, rate limits, and abrupt termination undercount
usage and failures. Zero reports do not prove health. There is no delivery SLA,
local replay, installation tracking, or automated fix loop.

