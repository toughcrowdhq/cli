# Architecture Decisions

## Repository Purpose

This public repository is the source of truth for the Tough Crowd CLI. The
hosted web application, API implementation, workers, infrastructure, database,
and sandbox providers live in a separate private product repository.

Keeping the client surface public provides inspectable source for the installed
package, public issues and contribution paths, npm provenance, and an
independent release cycle without exposing the hosted control plane.

## Runtime And Distribution

- Language: TypeScript.
- Runtime: Node.js 22.14 or newer.
- Package: `@toughcrowd/cli`.
- Executable: `toughcrowd` only.
- Initial distribution: npm.
- Source repository: `https://github.com/toughcrowdhq/cli`.
- License: Apache-2.0.

Signed standalone binaries, Homebrew, Scoop, and other package-manager channels
may follow after demand justifies the signing, platform-build, and support
costs.

## Product Boundary

The CLI is a thin client of Tough Crowd's public API.

It may depend on:

- Public HTTP endpoints.
- Public OpenAPI contracts.
- A generated client committed to this repository.
- A separately versioned public API client package.

It must not depend on:

- Application database schemas or migrations.
- Worker queues or job payloads.
- Cloud sandbox provider SDKs or implementations.
- Hosted application infrastructure.
- Server-only authentication/session internals.
- Private monorepo workspace packages.

Commands, flags, exit codes, environment variables, configuration files, and
machine-readable output are public compatibility contracts.

## Versioning

`package.json` is the version source of truth. Git tags use `v<version>` because
this repository has an independent release history.

Before 1.0:

- Patch releases are backward-compatible fixes.
- Minor releases add functionality and may contain breaking changes.

After 1.0, use ordinary Semantic Versioning.

## Interface Strategy

Build one executable with distinct presentation modes over the same API client
and session event model:

```text
commands -> application operations -> public REST and SSE APIs
                         |
                         +-> human output
                         +-> JSON or JSONL output
                         +-> future TUI
```

Ship the command interface and inline session streaming before a full-screen
TUI. If usage demonstrates a need for a multi-session attention dashboard, add
it explicitly as `toughcrowd ui`.

Do not silently change command semantics based on whether stdin or stdout is a
TTY. TTY detection may change color, spinners, progress rendering, and other
presentation details. It must not decide whether a command creates, watches,
or mutates a session.

`watch` output should be append-only and preserve terminal scrollback. It is
not the full-screen TUI.

## Canonical Vocabulary

`session` is the public unit of coding-agent work across the web app, CLI,
documentation, support, URLs, and telemetry.

Use `new` for the user action represented by **New session** in the web UI. The
canonical creation command is:

```sh
toughcrowd session new "Fix the flaky checkout test"
```

Do not introduce `run`, `task`, `job`, or `attempt` as public synonyms for a
session. Those terms can imply a different lifecycle or expose implementation
details. In particular, `run` suggests a foreground process that ends with the
invoking shell command, while a Tough Crowd session is a durable cloud object
that can outlive the terminal.

Use the existing product terms `repository`, `Agent Profile`, `evidence`,
`checks`, and session lifecycle statuses consistently. The CLI may use
surface-specific verbs such as `show`, `watch`, and `open`; those describe how
the user interacts with a session and do not introduce new domain objects.

## Command Grammar

Use noun-first resource namespaces:

```text
toughcrowd <noun> <verb> [identifier] [arguments] [options]
```

Rules:

- Put static command words before dynamic identifiers and user input.
- Use singular resource namespaces: `session list`, not `sessions list`.
- Keep one canonical spelling for each operation in the first release. Add
  shortcuts only after dogfooding demonstrates repeated friction.
- Require explicit identifiers for destructive or consequential operations.
  Never cancel, archive, delete, or merge an implicitly selected "latest"
  session.
- Explicit selectors such as `--last`, `--repo`, or `--branch` may be added for
  safe read-only operations when their behavior is unambiguous.
- Allow short session ID prefixes only when they resolve unambiguously.

Prefer:

```sh
toughcrowd session watch <session-id>
toughcrowd session prompt <session-id> "Add a regression test"
```

Do not use identifier-before-verb grammar:

```sh
# Do not use
toughcrowd session <session-id> watch
```

Do not overload a positional prompt as the default action of the `session`
namespace:

```sh
# Do not use as the canonical grammar
toughcrowd session "Fix the flaky checkout test"
```

That form conflicts with static subcommands when a prompt is `list`, `show`,
or another reserved command word. `session new` keeps creation explicit and
preserves `session` as a discoverable resource namespace.

## Session Command Surface

The intended command family is:

```sh
toughcrowd session new "Fix the flaky checkout test"
toughcrowd session new "Fix the flaky checkout test" --watch
toughcrowd session list
toughcrowd session show <session-id>
toughcrowd session watch <session-id>
toughcrowd session prompt <session-id> "Add a regression test"
toughcrowd session open <session-id>
toughcrowd session checks <session-id>
toughcrowd session diff <session-id>
toughcrowd session evidence <session-id>
toughcrowd session cancel <session-id>
toughcrowd session archive <session-id>
```

This is a product-language decision, not a claim that every listed command is
already implemented or belongs in the first implementation slice. Exact v1
scope should be selected in an executable project plan in this repository.

Meanings:

- `new` creates a durable cloud session.
- `list` returns sessions visible to the current user and organization context.
- `show` returns a bounded session summary.
- `watch` streams replayable session activity until interrupted or terminal.
- `prompt` sends a follow-up instruction to an existing session.
- `open` opens the web review surface for the session.
- `checks`, `diff`, and `evidence` inspect review inputs owned by the session.
- `cancel` stops active work through the product session lifecycle.
- `archive` removes a completed session from the active working set without
  treating it as deletion.

## Likely Future Namespaces

The likely long-term top-level command namespaces are:

```text
session
repo
profile
auth
integration
automation
review       # only if review becomes a cross-session queue or durable object
org          # when team and organization administration requires CLI access
config
```

### `repo`

Repository configuration has a lifecycle independent of a single session.
Likely operations include `list`, `show`, `add`, `sync`, `configure`, and
`remove`. Use `repo` in commands and `repository` in prose.

### `profile`

Agent Profile is the public abstraction for choosing agent harness, provider,
model, reasoning, and related execution defaults. Prefer `profile` over
independent top-level `agent`, `model`, or `provider` namespaces.

### `auth`

Authentication operations likely include `login`, `status`, and `logout`.
User-managed API tokens may later live beneath `auth token` rather than becoming
an unrelated top-level namespace.

### `integration`

GitHub, Slack, Linear, MCP connections, and similar external systems are kinds
of integrations. Prefer one `integration` namespace over separate top-level
commands for every external product or protocol. OAuth operations may hand off
to the web app.

### `automation`

Automations merit a namespace when they have an independent lifecycle, can
produce multiple sessions, and can be listed, enabled, disabled, or triggered.

### `review`

Keep checks, diffs, and evidence under `session` initially. Promote `review` to
a namespace only if Tough Crowd develops a cross-session review queue or a
durable review object with its own lifecycle.

### `org`

Add organization commands only when users need terminal access to context
selection, members, invitations, or organization policy.

## Namespace Test

A concept deserves a top-level noun when most of these are true:

1. It has an independent lifecycle.
2. It can be listed without first selecting a parent.
3. It has a stable ID or name.
4. It supports at least three meaningful operations.
5. It spans multiple sessions or other parent objects.
6. Users discuss it as a product object rather than an implementation detail.

Otherwise, keep it beneath its owner. For example:

```text
session -> checks, diff, evidence, logs, terminal, usage, cost, pull request
repo    -> runtime configuration, secrets
auth    -> tokens
```

## Terms That Stay Internal Or Nested

Do not add these as top-level public nouns without a separate product decision:

- `agent`: Tough Crowd supervises coding agents; use Agent Profiles for their
  configuration.
- `model` and `provider`: select them through an Agent Profile.
- `task`, `run`, and `job`: they compete with `session`.
- `attempt`: an internal execution concept unless the user-facing lifecycle is
  deliberately changed.
- `sandbox`: provider-neutral infrastructure, not the primary product object.
- `workspace`: associated with local-checkout products and not Tough Crowd's
  cloud sandbox model.
- `cloud`: redundant because the product execution path is already cloud-first.
- `mcp`, `plugin`, and `skill`: keep agent-host and repository configuration in
  the systems that own it unless Tough Crowd later provides an independent
  management lifecycle.

## Output Contracts

- Human-readable output is the default.
- Use `--json` for bounded request/response commands.
- Use `--jsonl` for event streams such as `session watch`.
- Write command results and machine-readable data to stdout.
- Write progress, warnings, and diagnostics to stderr.
- Respect `NO_COLOR` and provide stable non-TTY output.
- Version machine-readable event envelopes and include the session ID, event
  sequence, timestamp, type, and payload.
- Resume SSE streams from the last durable sequence after reconnecting.
- Use idempotency keys for retried mutating requests, especially session
  creation.

## Deferred Decisions

- The minimum command set for the first API-backed CLI release.
- Public CLI authentication and credential-storage mechanics.
- Exact JSON and JSONL schemas and stable exit-code categories.
- Whether dogfooding justifies any top-level shortcuts for session commands.
- The scope and terminal framework for `toughcrowd ui`.
- Whether merge or other promotion actions should ever be available from the
  CLI, and the confirmation and merge-readiness policy they would require.
