# Project: CLI Telemetry

## Goal

Make CLI failures visible and diagnosable so maintainers can fix them. Measure
command frequency and feature adoption as a secondary goal, using the same events.

## Context

This repository owns the CLI implementation checklist below. The app repository
owns the ingestion endpoint, browser sender, storage, queries, and alerts in
`toughcrowd-app-dev/.agents/projects/cli-telemetry/`. This project is self-contained:
no private app source, infrastructure package, or sibling checkout is required
to implement and test the CLI against the public contract.

Work was moved here from the app project's Phase 3 on 2026-10-30. Backend
ingestion support and explicit browser-source emission must deploy and be verified
before CLI rollout. Obtain their deployment evidence before release; this document
does not assert that either has been implemented. Mock the public boundary for
local tests; do not copy server code into this public repository.

[Contract and design](contract.md) contains the public HTTP shape, field bounds,
lifecycle, privacy rules, compatibility, and reporting failure behavior.
The contract is a proposal coordinated with the app project. Reconcile any
contract changes in both repositories before release; the deployed supported
OpenAPI contract becomes the executable authority once implemented.

Relevant current boundaries:

- `src/index.ts`: process startup, signal handling, finalization.
- `src/cli.ts`: command registration, error rendering, returned exit codes.
- `src/api/request.ts` and `src/api/errors.ts`: HTTP metadata and structured errors.
- Command-specific runtime/error adapters: preserve diagnostic context before
  rendering or wrapping errors.

Proposed defaults still requiring product review before release: enabled with
opt-out, anonymous reports permitted, authenticated account attribution, and
30-day operational retention. Keep these visible in public collection docs.
The app owner decides alarm thresholds; that is not a CLI implementation task.

## Scope

Canonical command start and terminal events, safe errors and request correlation,
best-effort delivery to `/api/client-logs`, opt-out, compatibility, documentation,
and package-level verification. Preserve stdout, stderr, exit status, and signals.

## Out Of Scope

Backend/browser implementation, AWS dependencies, analytics UI, automated fixes
or issue creation, persistent device IDs, disk queues, retries, raw terminal
capture, and per-request success events. No automatic package publication.

## Checklist

### CLI collection and release

Outcome: real commands report usage and diagnosable failures without changing
their public output or result.
Requirements: the scope and acceptance criteria in this README and contract.md.
Merge unit: one CLI PR including reporter, boundary changes, tests, public docs,
and feature Changeset. Depends on the app-owned backend ingestion and explicit web-client source phases
deployed and verified, and proposed defaults reviewed;
use current CLI main and record SHA in PR. No parallel phase. No feature flag.
Merge risk: Medium, because every recognized command gains network activity and
error/cancellation boundary changes. The backend-first split reduces deployment
risk; lifecycle correctness must still be integrated in one coherent CLI change.

**Owner Merge Warning:** This affects all reporting-enabled CLI users. Faulty
finalization could delay exits, lose diagnostics, or change command results;
unsafe extraction could disclose local data. Watch shutdown timing, output/exit
regressions, report volume, and sanitization. Immediate user disablement is
`TOUGHCROWD_TELEMETRY=0`; release a patch disabling reporting if needed. Rejecting
ingestion stops storage but does not fix client-side delays. Never merge without
the boundary and privacy evidence below.

Verification: deterministic transport/time/credential tests (including a
credential store that fails the test if telemetry calls it), command compatibility
tests, real process cancellation/deadline tests, package smoke and release gates.

- [ ] Confirm deployed app ingestion and browser-source verification evidence;
      reconcile the public schema with contract.md. Accept or revise collection
      default, anonymous attribution, retention, and account metadata before release;
      obtain the app owner's confirmation of its operational readiness.
- [ ] Add injectable reporter and early opt-out with no telemetry credential
      selection or network I/O when disabled; attach only the environment key or a
      credential the command already resolved, never reading the keychain; send
      explicit cli-client envelopes to client-logs with selected-origin-only
      transport and redirect refusal.
- [ ] Wire canonical command start and one terminal event, including validation,
      expected failures, wrapping, unexpected exceptions, and cancellation.
- [ ] Preserve failed request IDs/method/route and safe diagnostics through API
      and command errors; add allowlisted codes and package-frame normalization.
- [ ] Verify bounded shutdown, in-flight abort cleanup, offline/429/503 behavior,
      no recursion, no retries, and exact existing stdout/stderr/exit behavior.
- [ ] Verify old-server rejection and unsupported schema versions only drop
      telemetry; prove product upgrade-required errors can still be reported through
      ingestion without retry or fallback to the browser schema.
- [ ] Verify secret-canary exclusion, concurrent invocations, long-running commands,
      help/version exclusions, and literal JSON shapes in emitted requests.
- [ ] Publish collection/opt-out documentation and Changeset; run appropriate
      CLI format, lint, typecheck, tests, build, and packaged binary smoke checks.
- [ ] Exercise synthetic end-to-end success, local failure, API failure, and
      anonymous login failure against deployed ingestion; prove query correlation
      and release comparison. Record evidence before owner-directed publication.

## Acceptance Criteria

- One recognized invocation emits a start and at most one terminal event with
  the same invocation ID; multiple API calls do not become multiple commands.
- Canonical names exclude raw argv. Help/version and unknown commands are omitted;
  recognized-command validation failures remain observable.
- A malformed response preserves the business request ID and safe diagnostic
  code through wrappers. Local and unexpected failures retain safe package frames.
- Cancellation is distinct from failure; missing reports after SIGKILL, offline
  use, or initialization failure are not asserted to be confirmed crashes.
- Optional credentials permit attribution without initiating authentication.
  Telemetry never reads the OS credential store; commands that did not already
  resolve a credential and have no `TOUGHCROWD_API_KEY` report anonymously.
  No credential, raw message, absolute path, response body, or nested cause leaks.
- Either opt-out variable prevents all telemetry credential selection and I/O.
- Offline, rejected, old-server, or unsupported-schema responses leave the command
  output and status unchanged; all telemetry shutdown work fits within 500 ms.
- Literal payload, process cancellation, deadline, sanitization, and packaged
  binary checks pass. A synthetic deployed report can be correlated by the app
  operator before owner-directed publication.
