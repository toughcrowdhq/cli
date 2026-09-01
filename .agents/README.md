# Agent Guide

This is the canonical instruction file for the public Tough Crowd CLI.

## How To Work In This Repository

Start with the user's request and the code directly involved. Read only the
task-specific documents listed below; completed project plans are historical
context, not standing requirements.

Prefer the smallest end-to-end change that satisfies the demonstrated need.
Keep command adapters thin, put reusable behavior behind typed boundaries, and
verify public output literally. Do not create a project plan or architecture
proposal unless the user asks for one or an unresolved decision would
materially change the implementation.

Preserve unrelated work in a dirty checkout. Never create release tags,
publish a package, or merge generated changes without explicit maintainer
direction.

## Repository Purpose And Boundary

This repository is the source of truth for the public `@toughcrowd/cli`
package and its single `toughcrowd` executable. The CLI is a TypeScript client
of Tough Crowd's public HTTP API. It is not a coding agent and does not own the
hosted control plane.

Product direction:

> Agents can produce branches. Tough Crowd helps you decide what is safe to
> ship.

Describe the product in terms of coding-agent work, sessions, generated
changes, and human review. Avoid metaphorical room language and old codenames.

The CLI may use public API endpoints and contracts. It must not copy or depend
on private application database schemas, workers, infrastructure, sandbox
providers, or server-only packages. Keep provider and model selection explicit
through Agent Profiles.

Commands, flags, defaults, exit codes, environment variables, config formats,
and stdout/stderr behavior are public compatibility contracts. Avoid changing
them accidentally during internal refactors.

## Run The Development CLI

Use Node.js 22.14 or newer and the pnpm version declared in `package.json`.
From this repository root, install dependencies with:

```sh
corepack enable
pnpm install
```

Pass CLI arguments directly after the script name; do not insert an extra
`--` separator.

### Against the local app

```sh
cp .env.example .env.local
pnpm dev --help
pnpm dev auth status
pnpm dev auth login
```

`pnpm dev` runs the current TypeScript source through `tsx` and loads
`.env.local` when it exists. The example file sets:

```text
TOUGHCROWD_API_ORIGIN=http://localhost:3001
```

Start the local Tough Crowd app/API separately before using commands that make
requests. Shell environment variables override values loaded from
`.env.local`. The file is gitignored and must never be committed.

### Against production

```sh
pnpm dev:prod --help
pnpm dev:prod auth status
pnpm dev:prod auth login
```

`pnpm dev:prod` runs the same current TypeScript source without loading
`.env.local`. With no shell override it uses the built-in production origin,
`https://api.toughcrowd.dev`, and can read or mutate real production data. Keep
production commands narrow and verify the selected origin with `auth status`
before consequential operations.

Do not set `TOUGHCROWD_API_ORIGIN` when the intent is to test the default
production path. If the shell already exports it, unset it for that invocation
or environment.

### Against the built artifact

```sh
pnpm build
pnpm start --help
node dist/index.js --version
```

Use this path when behavior depends on the distributable JavaScript. Use
`pnpm smoke:package` to validate the actual npm tarball and installed binary.

## Authentication And The OS Keychain

Authentication is scoped to the canonical API origin. Local and production
credentials therefore coexist as separate entries:

```text
http://localhost:3001      -> local-development credential
https://api.toughcrowd.dev -> production credential
```

`auth login` binds a temporary callback on IPv4 loopback, opens browser
approval, exchanges the one-time code, and writes the resulting API key to the
native operating-system credential store through `@napi-rs/keyring`. It never
asks the user to paste the key or prints the key. A failed, denied, expired, or
cancelled login must leave an existing stored credential unchanged.

Stored entries use an origin-specific service name and a fixed account:

```text
service: com.toughcrowd.cli:<base64url canonical API origin>
account: api-key
```

The stored value is a versioned JSON record containing the credential kind,
the exact canonical origin, and the API key. Code must reject unsupported or
mismatched records; it must never reinterpret them, silently migrate them, or
fall back to a plaintext project file.

For CI or another non-interactive environment, use `TOUGHCROWD_API_KEY`. It
takes precedence over a stored credential for authenticated commands and is
never persisted. Never place a key in source, `.env.example`, prompts, logs,
test fixtures that may escape the repository, or command output. Do not inspect
or print the developer's real keychain contents while debugging; use the
in-memory credential-store boundary in tests.

Useful checks are:

```sh
pnpm dev auth status --json
pnpm dev:prod auth status --json
```

Status output may include the selected origin, credential source, account
email, and safe key metadata, but never credential material. If the OS
credential store is unavailable, use `TOUGHCROWD_API_KEY` for non-interactive
work; there is intentionally no file-backed credential fallback.

## Configuration Is Not Authentication

Machine-local config stores only non-secret session defaults such as Agent
Profile, model, and reasoning effort. It is separate from the OS credential
store. Never add credentials, identity, API origins, TLS behavior, or executable
hooks to this config.

Inspect and exercise the current source with:

```sh
pnpm dev:prod agent-profile list
pnpm dev:prod config path
pnpm dev:prod config list
pnpm dev:prod config set session.profile <profile-id>
pnpm dev:prod config set session.model <model>
pnpm dev:prod config set session.reasoning-effort <effort>
pnpm dev:prod config unset session.model
```

`config set` is authenticated because it validates the combined selection
against the live Agent Profile catalog before writing. Use
`TOUGHCROWD_CONFIG` in tests or experiments that should not modify the
developer's normal user-level config file.

## Implementation Conventions

- Keep `src/index.ts` as the small process and signal boundary.
- Keep Commander in the command adapter; application operations and API code
  should not receive Commander objects.
- Inject stdout, stderr, environment, fetch, timers, browser opening, and
  credential storage where behavior needs deterministic tests.
- Accept only relative API paths in authenticated clients so credentials cannot
  be redirected to another origin.
- Thread `AbortSignal` through requests and long-running operations.
- Write results and machine-readable data to stdout; write diagnostics and
  warnings to stderr.
- Use human-readable output by default, JSON for bounded automation output, and
  JSONL for future event streams.
- Use canonical product terms: session, repository, Agent Profile, evidence,
  and checks. Do not expose internal attempt, worker, database, or sandbox
  implementation details as public nouns.
- Install only the `toughcrowd` executable. Never add `crowd` as an alias.

## Verification

Run focused tests while iterating. Before handing off a finished change, run
the checks proportionate to its risk; the complete gate is:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:package
```

Tests live beside their source. Assert literal help, output, errors, exit codes,
and machine-readable shapes rather than deriving expectations from the
implementation. Use real disposable filesystem/process boundaries when they
are deterministic, and mock network, browser, credential-store, time, or
randomness boundaries when the real dependency is unsafe or nondeterministic.

User-visible changes require a Changeset. Before 1.0, use a patch Changeset for
compatible fixes and a minor Changeset for features or breaking changes.
Releases use npm Trusted Publishing with GitHub OIDC; never create or store a
long-lived npm publishing token. Never commit credentials, customer data, or
private application code.

## Task-Specific Documentation

Read a document only when the task touches its subject:

- [Architecture](architecture.md): product boundary, command grammar,
  authentication/config decisions, API behavior, and other durable decisions.
- [Testing](testing.md): test conventions and package-artifact verification.
- [Releasing](releasing.md): versioning, Changesets, tags, npm publishing, and
  support lines.
- [Project workspaces](projects/README.md): only when the user explicitly names
  an active project or asks to create/update a project plan.

The public [README](../README.md) is the user-facing command guide and
[CONTRIBUTING](../CONTRIBUTING.md) is the contributor entry point. Update them
when a change affects their audience; do not rely on agent-only documentation
to explain public behavior.
