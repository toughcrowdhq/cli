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
- Public API documentation and OpenAPI contracts as implementation references.
- Handwritten request and response types for operations the CLI implements.
- A separately versioned public API client package only when another supported
  consumer justifies one.

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
commands
  -> application operations
    -> public REST and SSE APIs
  -> selected presentation
    -> human output
    -> JSON or JSONL output
    -> future TUI
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

### Future TUI Boundary

Do not install or choose a TUI framework until `toughcrowd ui` has an approved
product scope. Anticipate it through application boundaries instead:

- Commander commands and the future TUI are separate adapters over the same
  application operations and public API client.
- Normalize replayable SSE messages into a public CLI `SessionEvent` model
  before any presentation layer consumes them.
- Expose live activity to consumers as an `AsyncIterable<SessionEvent>` that
  accepts an `AbortSignal`, not as Commander callbacks or renderer-specific
  state.
- Use a pure session-state reducer when a consumer needs a current projection
  of the event stream. Human `watch`, JSONL output, and the TUI may consume the
  same events differently.
- Keep raw terminal mode, alternate-screen behavior, focus, mouse handling, and
  cursor control exclusive to `toughcrowd ui`. Inline commands must never take
  ownership of the terminal this way.
- Lazy-load the TUI entry point so ordinary commands do not load its runtime or
  pay its startup cost.
- Share API types, event normalization, reducers, and application operations.
  Do not invent shared terminal components or a generic UI framework before a
  real TUI requires them.

When implementation begins, evaluate the then-current Ink and OpenTUI releases
against Node support, npm artifact size, cross-platform behavior, rendering
performance, accessibility, testability, native build requirements, and future
standalone-binary packaging. Ink is the conservative Node/React candidate;
OpenTUI is the higher-performance candidate with a native core. Neither is a
current dependency or settled choice.

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

## Command Implementation

Use Commander as the argument parser, command router, usage-error handler, and
help generator.

Commander fits this CLI because it supports nested commands, strict unknown
option and excess-argument handling, asynchronous actions through
`parseAsync()`, configurable help and output, and exit overrides for tests. Its
supported Node range is compatible with this package's Node 22.14 minimum.

Treat Commander as an outer adapter, not as the application framework:

```text
process entry point
  -> Commander command definitions
    -> typed application operations
      -> public API client and session event source
    -> selected human, JSON, JSONL, or future TUI presentation
```

Command actions must translate parsed arguments and options into ordinary typed
inputs, call one application operation, and pass the result to the selected
presentation path. Application operations, API clients, event reducers, and
presenters must not import Commander or receive Commander `Command` instances.

Use the regular `commander` package initially. Do not add
`@commander-js/extra-typings` until repeated option-typing mistakes demonstrate
that its additional generic types improve this codebase. Explicit option DTOs
at the adapter boundary are the initial default.

Do not adopt oclif now. Its plugin system, lifecycle hooks, generated
documentation, autocomplete plugins, installer tooling, and command discovery
become valuable for a much larger or third-party-extensible CLI, but its
project conventions and runtime surface are unnecessary for the initial public
client. Reconsider it only if those platform capabilities become requirements.

Clipanion is the preferred fallback if Commander proves inadequate and stronger
type-driven command definitions become the deciding requirement. Yargs and
Citty are not preferred: Yargs exposes a broader builder and coercion model than
this CLI needs, while Citty's young public surface is a weaker foundation for
commands and flags that are compatibility contracts. Do not hand-build nested
routing and help on Node's `util.parseArgs`.

### Source Boundaries

Organize implementation around these responsibilities as the command surface
grows:

```text
src/
  index.ts                    process boundary
  cli/
    runCli.ts                 parse arguments and return an exit code
    createProgram.ts          configure the Commander root
    runtime.ts                injected process capabilities
    commands/                 noun and verb command adapters
  application/                framework-independent operations
  api/                        public REST client, SSE client, and DTOs
  events/                     normalized events and pure reducers
  output/                     human, JSON, and JSONL presentation
  ui/                         absent until the TUI is implemented
```

This is a responsibility map, not a requirement to create empty directories or
one file per command before their complexity justifies it.

### Process And Error Boundary

Keep the executable process boundary small. Evolve the current CLI entry point
toward an interface like:

```ts
runCli(args: readonly string[], runtime: CliRuntime): Promise<number>
```

Rules:

- `src/index.ts` owns `process.argv`, OS signals, and assigning
  `process.exitCode`.
- Command handlers and application operations must not call `process.exit()`.
- Inject stdout, stderr, environment access, URL opening, and other process
  capabilities needed by tests or alternate clients.
- Configure Commander output and exit overrides so help, version output, usage
  failures, and suggestions are testable without terminating the test process.
- Map parser and application failures to stable public exit categories at one
  boundary.
- Use one `AbortController` for `SIGINT` and `SIGTERM`; pass its signal through
  application operations, fetch calls, SSE streams, and future TUI shutdown.
- Install Commander as a runtime `dependency`, not a `devDependency`, because
  it is required by the packed executable.

The test suite should assert literal help, errors, stdout, stderr, and exit
codes through `runCli`. The package smoke test remains responsible for proving
that the installed tarball exposes and executes only the canonical
`toughcrowd` binary.

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

Initial authentication operations include `login` and `status`. API keys are
created and managed in the web application. If dogfooding demonstrates a need
for local credential removal or terminal key lifecycle management, add
explicitly named operations beneath `auth` rather than assuming session-style
logout semantics or introducing an unrelated top-level namespace.

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

## Authentication And Configuration

Keep authentication identity separate from project context:

```text
user or environment -> authentication identity
working directory   -> repository and session defaults
```

A repository must never select the user's identity or cause a credential to be
sent to a different service. Directory context may influence safe project
defaults, but it must not influence authentication, credential storage, API or
web origins, TLS behavior, or executable hooks.

### Authentication Context

Initially support one active human identity per canonical API origin. Do not
select an identity based on the current directory, and do not add named-account
or directory-to-account mappings in the first release.

Store credentials keyed by canonical API origin so production and local
development can coexist without sharing credentials:

```text
https://api.toughcrowd.com -> production credential
http://localhost:3001     -> local-development credential
```

If multiple accounts per origin become necessary, add explicit account
selection through `auth` commands. Do not call authentication accounts or
contexts profiles because `profile` is the established Agent Profile resource.

The initial authentication command family is:

```sh
toughcrowd auth login
toughcrowd auth status
```

`auth status` should report the API origin, authenticated identity, credential
source, key name, and relevant expiration state without revealing credential
material. The initial CLI does not expose logout, local credential removal, or
key revocation. Re-running `auth login` may replace the stored credential only
after explicit interactive confirmation. API-key lifecycle management,
including revocation, remains in the web application until demonstrated CLI
usage justifies additional commands.

### Initial API Key Authentication

An account currently represents one user, so use account-owned API keys for
both interactive CLI use and unattended automation. Do not build OAuth,
loopback callbacks, device authorization, access-token refresh, or a separate
personal-token taxonomy until multi-user accounts or demonstrated login
friction justifies that machinery.

The service should allow multiple independently named keys per account. Every
key must be high entropy, expiring, displayed only at creation, stored as a
one-way verifier, individually revocable, and accompanied by safe creation,
last-used, expiration, and revocation metadata. Initial keys inherit the
account's product permissions; do not introduce unused key scopes before the
product has meaningfully different permission sets.

`auth login` should direct the user to create a key in the web application,
read the pasted key through a hidden interactive prompt, validate it against
the resolved API origin, and store it through the configured credential store.
Do not accept a key as a command-line option where it can leak through shell
history or process listings.

Supply non-persisted keys to CI, automation, and local debugging through
`TOUGHCROWD_API_KEY`. An environment key is runtime-only and must never be
persisted, refreshed, or modified automatically.

If accounts later contain multiple users, existing API keys may remain
account-owned automation credentials while browser-approved OAuth becomes the
preferred human login. Both credential types must resolve to the same
authenticated-principal boundary, and stored credential records must be
format-versioned and tagged by credential type so the migration does not
require reinterpreting API keys as OAuth refresh tokens.

### Credential Storage

Use the operating-system credential store by default. If it is unavailable:

- An interactive login may offer a permission-restricted user-level file
  fallback after explaining the downgrade.
- Non-interactive use must fail unless file storage was explicitly configured
  or an environment token is present.
- File storage must use platform-appropriate user data directories and the
  strongest practical user-only permissions, including mode `0600` on Unix.
- Credentials must never be written to a project directory or project config.

Do not silently downgrade from the credential store to plaintext file storage.

### Configuration Sources

Resolve ordinary non-secret settings in this precedence order:

```text
command-line flag
  > environment variable
  > project configuration
  > user configuration
  > Git repository detection
  > product default
```

The resolver should retain the winning source for each value so diagnostics and
a future `config explain` command can make resolution understandable.

Project configuration may be added when dogfooding demonstrates a need. When
introduced, load it from the Git repository root and give it an explicit
allow-list of safe settings such as:

```text
repository
base branch
Agent Profile
```

Project configuration must not set credentials, authentication identity, API
or web origins, TLS settings, credential-storage behavior, or commands and
hooks. Reject sensitive or unknown project keys rather than silently granting
them authority.

The initial environment contract is:

```text
TOUGHCROWD_API_KEY
TOUGHCROWD_API_URL
TOUGHCROWD_WEB_URL
TOUGHCROWD_REPO
TOUGHCROWD_AGENT_PROFILE
NO_COLOR
```

Credential resolution is separate from ordinary configuration precedence:

```text
TOUGHCROWD_API_KEY
  > stored credential for the resolved canonical API origin
  > authentication required
```

When `TOUGHCROWD_API_KEY` is present, do not load, persist, or otherwise modify
a stored API key. Changing `TOUGHCROWD_API_URL` must never send a stored
production key to the override origin; use only a key stored for that exact
canonical origin or the environment key supplied for the current invocation.

## Project CLI Versions And Config Compatibility

Separate a repository's CLI compatibility requirement from executable version
selection:

```text
compatibility requirement -> says whether the running CLI may operate
version selection         -> decides which CLI executable to launch
```

The Tough Crowd CLI may enforce a repository compatibility requirement, but it
must not initially download or execute another CLI version automatically.

### Initial Version-Pinning Model

Use the Node package ecosystem for exact, reproducible project pins. A
repository that needs a specific version should install an exact
`@toughcrowd/cli` development dependency, commit its package-manager lockfile,
and invoke the repository-local executable:

```json
{
  "devDependencies": {
    "@toughcrowd/cli": "0.2.4"
  },
  "scripts": {
    "toughcrowd": "toughcrowd"
  }
}
```

```sh
pnpm toughcrowd session list
pnpm exec toughcrowd session new "Fix the flaky checkout test"
```

When project configuration is introduced, reserve a `requiredCliVersion`
semantic-version constraint. It is a compatibility guard, not an installation
or version-resolution instruction. An incompatible CLI must fail before
loading credentials, making an API request, or mutating local or remote state,
and should show the running version, required range, and an actionable command
for invoking the repository-local version.

Do not add transparent global-to-local re-execution. A user who invokes a local
package through `pnpm`, `npm`, or another tool manager has explicitly selected
repository code; an unrelated global executable must not silently make that
trust decision for them.

### Project Config Versioning

Reserve these metadata fields in the first project-config schema:

```text
$schema
schemaVersion
requiredCliVersion
```

Apply these compatibility rules:

- Anchor project configuration and its CLI requirement at the Git repository
  root. Do not search above that root or select different CLI versions from
  nested directories in the initial design.
- A newer CLI should read every older schema version it still supports.
- A CLI that encounters an unsupported newer `schemaVersion` must fail before
  taking action instead of guessing at its meaning.
- Treat unknown or disallowed project keys as validation errors with their
  source location.
- Additive fields may evolve within a schema only when their absence preserves
  existing behavior. Breaking interpretation changes require a schema-version
  increment.
- Never rewrite committed project configuration automatically. Future
  `config migrate` behavior must be explicit and produce an ordinary reviewable
  Git diff; `config migrate --check` should be non-mutating.
- A user override may choose a newer compatible executable, but it must not
  weaken a repository's minimum compatibility constraint.

The project config's sensitive-key restrictions remain invariant across schema
versions. No schema version may grant a repository authority over credentials,
authentication identity, service origins, TLS, credential storage, or
executable paths and download sources.

### Compatibility And Security Minimums

Every API request should identify the CLI version and platform through a stable
user agent. The service must be able to reject unsupported or known-vulnerable
clients before accepting consequential operations.

A repository version constraint cannot override a service security minimum or
revoked release. Prerelease versions require explicit user selection. Publish a
clear client support window before the public API begins rejecting otherwise
valid older clients.

### State Across CLI Versions

Share only state that has an intentionally versioned, concurrency-safe format:

```text
shared across versions
  credentials keyed by canonical API origin
  user-level non-secret configuration

versioned or disposable
  caches
  generated metadata
  update state
  transient session state
```

Credential storage needs its own format version plus atomic updates and locking
so concurrent CLI versions cannot corrupt state or race refresh-token rotation.
An older CLI must never downgrade or destructively rewrite a credential format
it does not understand.

### Future Version-Selecting Launcher

Reconsider a Tough Crowd-managed launcher only if repository-local package
invocation and external tool managers create demonstrated user friction. Such a
launcher is a separate security-sensitive product boundary, not an extension of
ordinary project-config loading.

A future launcher would require a small stable toolchain manifest and must:

- Resolve only official releases; project configuration may not provide an
  executable path, registry, package source, or download URL.
- Verify artifact signature and integrity before caching or execution.
- Enforce security minimums and revoked versions before handing credentials to
  the selected CLI.
- Define deterministic range resolution, prerelease policy, offline behavior,
  concurrent-download locking, platform selection, and cache cleanup.
- Report both launcher and selected CLI versions in diagnostics.
- Keep the toolchain manifest independently parseable from versioned product
  configuration to avoid requiring a selected CLI to interpret the instruction
  that selects it.

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
- The exact API key format, default lifetime, and maximum lifetime.
- The product and account-model threshold for adding browser-approved OAuth as
  the preferred human login.
- The filename, format, and initial schema for optional project configuration.
- The public client support window and minimum-version enforcement policy.
- Whether demonstrated usage ever justifies a Tough Crowd-managed
  version-selecting launcher.
- Exact JSON and JSONL schemas and stable exit-code categories.
- Whether dogfooding justifies any top-level shortcuts for session commands.
- The scope and terminal framework for `toughcrowd ui`.
- Whether merge or other promotion actions should ever be available from the
  CLI, and the confirmation and merge-readiness policy they would require.
