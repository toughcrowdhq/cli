# CLI telemetry verification

Implementation base: `233872362a67da795c6f51f112b9f979274d9a15`.

The CLI uses the proposed schema in [contract.md](contract.md). The public
production OpenAPI document was inspected during CI repair, but does not document
the ingestion endpoint, so deployed-schema reconciliation remains incomplete.
The two external checklist items remain open and block merge under the project's
Owner Merge Warning.

Deployed-contract investigation for PR #67 head
`7e2c40ee381ed4d3e65bd525978308210932549c`:

- At `2026-10-30T23:52:21.159Z`, an unauthenticated GET of
  `https://api.toughcrowd.dev/openapi.json` returned HTTP 200 with OpenAPI 3.1.0,
  product API version `0.0.0`, and 22 documented paths. None contains
  `/api/client-logs`. The response SHA-256 was
  `2ed4d8ad8d0b059be64f9e9794e49015ffc03f0d6f40b4de4ea5cb6c55bc700a`.
- The alternate `/api/openapi.json` path returned HTTP 404. Absence from these
  documents does not prove that an ingestion implementation is absent; it means
  this investigation cannot reconcile a supported deployed ingestion contract.
- No app-owner deployment or policy approval evidence was present in PR #67's
  comments or reviews from repository owners, members, or collaborators when
  inspected. Approval or deployment evidence may exist elsewhere and must be
  supplied by the app owner.
- These checks were read-only. They did not use credentials, inspect the native
  credential store, send synthetic telemetry, or establish ingestion acceptance,
  browser-source deployment, account attribution, access controls, retention,
  operator query correlation, or release comparison.

To unblock the CI review, obtain the supported deployed ingestion contract,
backend/browser deployment evidence, app-owner approval of collection and
privacy defaults, and operator correlation evidence for the required synthetic
scenarios. A CLI code change or a local stub result cannot supply those facts;
the checklist must stay open until that evidence is available.

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
