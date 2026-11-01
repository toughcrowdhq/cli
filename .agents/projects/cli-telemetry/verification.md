# CLI telemetry verification

Implementation base: `233872362a67da795c6f51f112b9f979274d9a15`.

The CLI contract was reconciled with the public production OpenAPI document on
2026-11-01. Production now documents and accepts CLI v1 ingestion. App-owner policy
approval, explicit browser-source deployment verification, authenticated
attribution verification, and operator-side correlation remain outstanding. The
external checklist items remain open until those remaining facts are established.

Production recheck of PR #67 after head
`578b8f7e2b1023874038e911de5e56a04b0381c4`:

- At `2026-11-01T21:27:07.709Z`, an unauthenticated GET of
  [production OpenAPI](https://api.toughcrowd.dev/openapi.json) returned HTTP 200
  with OpenAPI 3.1.0, product API version `0.0.0`, and 23 documented paths, including
  `/api/client-logs`. The response SHA-256 was
  `839899d1e56b3f4cf7feff3a10bfb0d3867edd26eceab16028e708c2ffd07ece`.
- The strict `CliTelemetryRequest` / `CliTelemetryEventV1` schema uses source
  `cli-client`, exactly one event, and schema version 1. It confirms the four error
  boundary rules fixed in this recheck: the wire error kind is `local-io`, optional
  API context requires both method and route, request IDs may include dots, and
  frame directory segments exclude dots. CLI versions must match the published
  numeric version pattern. Internal `local-I/O` errors are normalized by the sender.
- At `2026-11-01T21:30:22.918Z`, the built reporter submitted eight synthetic
  reports to `https://api.toughcrowd.dev/api/client-logs`, using the normal 500 ms
  deadlines, explicit CLI envelopes, and no retries. Every report returned
  HTTP 202 with `{"accepted":1}`. No bearer credential or cookie was supplied.
  CLI version was `0.8.0`, with CI execution context. The following IDs let an
  operator query each started/finished pair:

| Scenario                | Command        | Invocation ID                          | Terminal event ID                      |
| ----------------------- | -------------- | -------------------------------------- | -------------------------------------- |
| success                 | `config path`  | `21fc510b-ec61-454e-ae6e-c3cbd754032a` | `01b654ec-08db-4333-a75f-a12316a1c182` |
| local-failure           | `config list`  | `273ec885-5e56-4631-8c63-dfcdca5fafb8` | `aa2e176b-6b24-4c8f-9a04-12364f6a29d2` |
| api-failure             | `session list` | `99109308-16ee-41cd-a81e-4de755f82590` | `8edde8ce-10ab-4058-993f-0e05f20d20a1` |
| anonymous-login-failure | `auth login`   | `154b4e35-be43-4aa5-b3c4-266ce62d351e` | `f903e2b6-62a0-44a6-8c85-fdf41d39329c` |

- The API-failure scenario used a real anonymous `GET /api/sessions` response:
  HTTP 401, business request ID `e6a29978-2cd9-4205-999d-5751aa2f6a34`. That exact
  request ID, method, registered route, and status were present in the accepted
  terminal report. Its error kind was `authentication` with code
  `authentication-required`; the local failure used `local-io` with code
  `configuration-io-failed`.
- These were reporter-boundary probes. The local failure and anonymous login
  failure used synthetic error objects; no real login was initiated and no native
  credential store was inspected. The earlier disposable-process smoke tests
  cover full command wiring, but these live probes do not establish a real failed
  browser-login flow or authenticated attribution.
- HTTP 202 establishes endpoint acceptance, not an independently verified storage
  query or operator correlation. App-owner approval evidence was still absent
  from repository-owner/member/collaborator comments and reviews on PR #67 during
  this recheck. No claim is made about privacy-policy approval, actual browser
  source emission, storage retention, access controls, or release comparison.

Historical blocker: on 2026-10-30, `/openapi.json` had only 22 paths and omitted
`/api/client-logs` (SHA-256
`2ed4d8ad8d0b059be64f9e9794e49015ffc03f0d6f40b4de4ea5cb6c55bc700a`). The
2026-11-01 recheck above supersedes that endpoint/schema absence finding.

All local gates passed after this reconciliation on 2026-11-01:
`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (338 tests across
33 files), `pnpm build`, and `pnpm smoke:package`.

Local evidence:

- `src/telemetry.test.ts`: literal single-entry v1 envelopes, correlation IDs,
  monotonic timing, canonical validation failures, help/version/unknown exclusions,
  opt-out before credential selection, keychain tripwire, resolved credential reuse,
  origin isolation, cancellation, concurrent invocations, long-running commands,
  malformed business responses through wrappers, unknown codes, secret canaries,
  package-frame normalization, offline and rejected delivery, and deadline cleanup.
- `src/api/routes.test.ts`: registered templates omit identifiers and queries;
  unknown routes and raw identifiers cannot be transmitted as templates.
- Existing command tests use a separate accepting telemetry transport and continue
  asserting their original literal business output, errors, and exit codes.
- `scripts/fixtures/package-smoke-telemetry.mjs`: actual installed entry point
  against a disposable loopback ingestion stub. Checks anonymous local success,
  recognized validation failure, anonymous login/API failure with business request
  correlation, stalled ingestion and real process exit, opt-out, and SIGINT/SIGTERM
  cancellation with independent terminal delivery (signals on POSIX).
- No real credential store is inspected and no production requests are made by
  these checks. The npm tarball is installed in a disposable prefix.

Before merge/release, the app owner must provide backend/browser deployment
confirmation, accept the proposed collection/attribution/access/retention defaults,
and confirm operational readiness. Use the live IDs above to verify operator query
correlation, and complete authenticated attribution, a real anonymous login failure,
and version comparison as needed. No package publication, tagging, or merge is
performed by this implementation.
