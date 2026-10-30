# CLI telemetry verification

Implementation base: `233872362a67da795c6f51f112b9f979274d9a15`.

The CLI uses the proposed schema in [contract.md](contract.md). No deployed
OpenAPI reconciliation or private app implementation was available or needed for
local implementation. The two external release checklist items remain open.

All local gates passed on 2026-10-30: `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` (324 tests across 33 files), `pnpm build`, and
`pnpm smoke:package`.

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

Before release, the app owner must provide deployed ingestion and explicit browser
source evidence, reconcile the schema, accept the proposed collection/attribution/
retention defaults, and confirm operational readiness. Then exercise synthetic
success, local failure, API failure, and anonymous login failure against that
service, with operator query correlation and version comparison. Local stubs do
not establish those deployment or storage properties. No package publication,
tagging, or merge is performed by this implementation.
