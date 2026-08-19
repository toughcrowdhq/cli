# Project: CLI Session End Commands

## Goal

Let authenticated CLI users stop active coding-agent work and abandon
review-ready changes without returning to the web app.

## Context

The CLI already lists full session IDs and uses the supported product API with
API-key authentication. The app already has cancel and abandon lifecycle
operations, but they were browser-only and absent from the supported OpenAPI
contract.

## Scope

- Add `toughcrowd session cancel <session-id>`.
- Add `toughcrowd session abandon <session-id>`.
- Require a full UUID and support bounded human and JSON output.
- Expose both existing lifecycle operations through the bearer-authenticated
  supported product API with structured errors.
- Cover command routing, response projection, conflicts, authentication,
  installed-package behavior, and the supported OpenAPI paths.

## Out Of Scope

- Implicit latest-session selection or interactive pickers.
- Deleting branches, archives, sessions, or persisted review evidence.
- Changing the existing server lifecycle rules for which states may be
  cancelled or abandoned.

## Checklist

- [x] Add failing CLI command-contract tests.
- [x] Implement cancel and abandon API calls and output.
- [x] Accept API-key principals in the existing server lifecycle routes.
- [x] Add the routes to the supported product OpenAPI contract.
- [x] Document the commands and add release metadata.
- [x] Run the complete CLI verification suite.

## Acceptance Criteria

- A valid explicit session ID produces one authenticated POST to the matching
  lifecycle endpoint.
- Human output identifies the action, session, and resulting status; JSON
  output contains no server-only fields.
- Invalid IDs fail before authentication or network access.
- Lifecycle conflicts and authentication failures use stable diagnostics and
  do not expose secrets.
- The packed CLI contains and successfully executes both commands.
