# @toughcrowd/cli

## 0.7.0

### Minor Changes

- cda788b: Add append-only Issue comment creation and display comments in Issue detail.
- af5ba25: Add issue type and priority support to issue creation, updates, and output.
- 0bf6529: Add machine-local Agent Profile, model, and reasoning-effort session defaults.
- 5841070: Add the `toughcrowd incident` command group for creating, listing, inspecting,
  updating, resolving, reopening, and annotating Incident Repository records.
- f7f9b9b: Support operational timestamps, component impacts, actor attribution,
  report-grade Markdown notes up to 256 KiB, note deletion, and incident component
  management throughout the `toughcrowd incident` workflow.

### Patch Changes

- 862023a: Require a repository before creating an incident so missing repository context
  produces a local usage error instead of an invalid API request.
- ce5f032: Keep issue commands compatible with API responses that no longer include the
  retired severity field.

## 0.6.0

### Minor Changes

- a0cfc51: Add `--issue-id` to `session new` so coding-agent work can be associated with an issue as it is created.
- 2adb937: Add `toughcrowd deploy report` to report successful production deployments from GitHub Actions and display their asynchronous reconciliation state.

## 0.5.0

### Minor Changes

- 4230e0f: Add `session cancel` and `session abandon` commands for explicitly ending coding-agent sessions by ID.
- ec7316e: Add issue capture, inspection, lifecycle, verification, session-linking, GitHub-linking, and summary commands backed by the Tough Crowd Issues API.

### Patch Changes

- d40a562: Handle unfamiliar session statuses without rejecting otherwise valid API responses.

## 0.4.0

### Minor Changes

- d667850: Support filtering, decoding, and human-readable rendering for sessions with the `needs_input` and `awaiting_checks` statuses.

## 0.3.0

### Minor Changes

- ae64ad3: Add the authenticated `toughcrowd session list` command with filters, cursor
  pagination, bounded human output, and a stable JSON response.
- c437c37: Add `toughcrowd session new` with deterministic repository and optional Agent
  Profile override resolution, server-default delegation, idempotent creation
  requests, and bounded human or JSON output.

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
