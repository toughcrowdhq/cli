# Project: Model Reasoning Effort

## Goal

Make the public Tough Crowd CLI preserve and enforce the API's model-specific
reasoning effort capabilities when listing profiles, configuring defaults, and
creating sessions. Accept verified native values without inventing model support
or overriding the server's model-specific defaults.

## Context

In [src/agent-profile.ts](../../../src/agent-profile.ts), the current decoder turns
string model entries into models with empty effort lists and ignores the legacy
profile-level list. Local validation treats an empty list as unrestricted, so
invalid values pass locally and fail later at the API.

The [application project](../../../../toughcrowd-app-dev/.agents/projects/model-reasoning-effort/README.md)
owns the capability catalog, API, persistence, web UI, workers, and coding-agent
sandbox adapters. This project owns changes only in `toughcrowd-cli-dev`.
Its checklist is independent of the app project's progress record.

Planning source reference: CLI commit
`e588325c5d0453a4776f8bd3c6a254c6e089477f`. Use the accepted current CLI base when
implementing; preserve unrelated changes.

## Scope

- Decode modern per-model capabilities and retain explicit legacy restrictions.
- Validate combined profile/model/effort after existing configuration precedence
  is applied and before a configuration write or session creation request.
- Update profile output and session response handling for native higher effort
  values, model defaults, and null effort.
- Add regression tests, public documentation, and the appropriate Changeset.
- Supply a compatible CLI release version and verification evidence to the app
  project through the existing maintainer-directed release process.

## Out Of Scope

Application repository changes, server validation/default resolution, database
migrations, model capability research, and Claude Code/Codex runtime installation
or invocation. Do not import private app packages or copy model capability lists
into the CLI. Do not add a new shared package or API endpoint.

## Public Contract

Coordinate this proposed contract with the
[application design](../../../../toughcrowd-app-dev/.agents/projects/model-reasoning-effort/design.md#catalog-and-ownership)
before implementation. The server is authoritative for model support and defaults.
The examples below describe response shape, not a hard-coded model matrix.

A modern profile includes `models` entries with `id` and `reasoningEffort`:

```json
{
  "id": "example-model",
  "reasoningEffort": {
    "supported": true,
    "values": ["low", "medium", "high", "xhigh"],
    "default": "medium"
  }
}
```

An unsupported model has `supported: false`, `values: []`, and `default: null`.
A supported model has unique, nonempty native values and a default in that list.
Reject duplicate model IDs and missing or contradictory modern capability data.
Modern entries take precedence over legacy projections; malformed modern entries
must not silently fall back to legacy data.

For today's string-model responses, preserve the explicit profile-level
`supportedReasoningEfforts` list on each model. Keep legacy metadata distinguishable
from verified per-model metadata; it cannot establish a model-specific default.
An explicitly empty list permits no explicit effort. Missing legacy metadata
permits model selection and omission, but explicit effort produces an actionable
catalog/upgrade error. Never treat an empty or unknown list as unrestricted.

Preserve exact native values, including higher levels when the catalog advertises
them. A literal `none` value is distinct from null or omission and is allowed only
when advertised. Do not remap `xhigh` or `max` to `high`.

Preserve existing flags and config precedence. An incompatible explicit saved
effort fails before saving config or sending a session POST; report the selected
profile/model and allowed values. Do not silently reset config when the model
changes. Omitted effort remains omitted for the server to resolve. Display the
catalog default where useful, but do not inject a universal or client-owned
default. Session responses may contain null effort for unsupported models; handle
that without printing a fabricated effort or conflating it with literal `none`.

## Delivery And Dependency

One CLI pull request containing implementation, tests, public docs, and a Changeset.
Agree on public fixtures with the app project first. This work can be developed
against fixtures while application work proceeds independently; it must continue
to work against the current API before the new contract is deployed.

The compatible CLI release precedes application activation. Record the actual
release version and tested commit here for the app's existing minimum-client
policy. No release version is preselected. Never tag, publish, or merge without
explicit maintainer direction; creating this project does not authorize release.

Merge risk is low before API activation: valid existing selections remain usable,
and invalid selections fail earlier. If decoding/config behavior regresses, revert
before activation. After activation, preserve modern contract compatibility in a
forward fix; the app may reject a rollback to an older unsupported CLI version.
No feature flag is needed.

## Checklist

- [ ] Agree on literal modern and legacy API fixtures with the application project,
      covering model support/defaults, null session effort, and upgrade-required
      errors; keep the two project contract descriptions consistent.
- [ ] Update `src/agent-profile.ts` and its tests to decode modern capabilities,
      preserve legacy profile restrictions, and reject malformed/duplicate data
      without a permissive fallback.
- [ ] Validate the final combined selection in config and session flows before
      filesystem writes or session POSTs; preserve existing config on failure and
      keep omitted effort absent from requests.
- [ ] Update profile output and session response/types/output boundaries for
      catalog defaults, unsupported effort, and exact higher native values.
- [ ] Add literal regression tests for valid/invalid pairs, empty/missing metadata,
      invalid defaults, model changes, explicit higher values, null responses,
      unchanged config after failure, and public errors/help/output.
- [ ] Update the public README and add a Changeset appropriate to the final public
      contract, following repository versioning guidance.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`, and `pnpm smoke:package`; record results and reviewed commit.
- [ ] Record the compatible release version and current/modern API compatibility
      evidence after the maintainer-directed release; hand off the version to the
      app project and verify the active client before server activation.

## Acceptance Criteria

- Legacy string models retain the explicit profile effort restrictions.
- Modern models use their own supported values and defaults; malformed or missing
  capability metadata never allows arbitrary effort values.
- Invalid combined selections fail locally before config mutation or session
  creation, with useful diagnostics and existing configuration intact.
- Advertised higher values pass unchanged; omitted effort stays omitted and null
  response effort is handled explicitly.
- Existing valid commands against the current API remain usable, and contract
  tests prove compatibility with the new API response shape and upgrade errors.
- Public documentation, Changeset, tests, and installed-package checks accompany
  the change. The application project receives an actual compatible release
  version before activating its changed server contract.

## Delivery Evidence

Record the accepted fixture/contract reference, reviewed commit, test results,
compatible release version, and active-client verification here during delivery.
The checklist above is the sole progress record for CLI implementation.
