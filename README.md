# Tough Crowd CLI

The public command-line client for Tough Crowd, which supervises coding-agent
work in cloud sandboxes and helps people decide what is safe to ship.

The CLI provides API-key authentication plus session, issue, incident, and
deployment workflows.

## Install

After the first public release:

```sh
npm install --global @toughcrowd/cli
toughcrowd --version
```

## Develop

From the repository root:

```sh
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev --help
```

`pnpm dev <arguments>` runs the latest TypeScript source and optionally loads
the local API origin from the gitignored `.env.local` file. Shell environment
variables override values loaded from that file. The example points the CLI at
the default local API port.

Run the latest TypeScript source against the production API without loading
`.env.local`:

```sh
pnpm dev:prod auth login
pnpm dev:prod auth status
```

This uses the CLI's built-in `https://api.toughcrowd.dev` origin and operates
on real production data.

Build and run the distributable JavaScript when checking the production path:

```sh
pnpm build
pnpm start --help
```

Expected output:

```text
Usage: toughcrowd [options] [command]

The command-line client for Tough Crowd

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  auth            Manage Tough Crowd authentication
  config          Manage machine-local Tough Crowd preferences
  agent-profile   Discover executable Agent Profiles
  session         Work with Tough Crowd sessions
  issue           Work with Tough Crowd issues
  incident        Work with Tough Crowd incidents
  deploy          Report Tough Crowd deployments
  help [command]  display help for command
```

Print the package version with:

```sh
node dist/index.js --version
```

Run the focused checks with:

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm smoke:package
```

The published executable will be named `toughcrowd`. The package intentionally
does not install `crowd` as an alias.

## Authentication

Authenticate through the Tough Crowd web app:

```sh
toughcrowd auth login
toughcrowd auth status
```

`auth login` binds a temporary IPv4 loopback callback, opens browser approval,
exchanges the approved one-time code, and stores the resulting API key in the
operating-system credential store for the current API origin. The API key is
never displayed or pasted into the terminal.

For non-interactive environments, set `TOUGHCROWD_API_KEY`:

```sh
TOUGHCROWD_API_KEY=tc_... toughcrowd auth status
```

Environment credentials take precedence over stored credentials and are never
persisted. Override the API origin with `TOUGHCROWD_API_ORIGIN`.

## Sessions

Create a durable cloud session with a prompt and repository:

```sh
toughcrowd session new "Fix the flaky checkout test" \
  --repo toughcrowdhq/app
```

Repository resolution uses `--repo`, then `TOUGHCROWD_REPO`, then a
recognizable GitHub HTTPS or SSH `origin` remote in the current checkout.
Session selection resolves independently for Agent Profile, model, and reasoning
effort: an explicit flag wins over an environment variable, which wins over
machine-local configuration; omitted fields retain the existing server or
selected-profile default. Without an Agent Profile override, the server selects Codex with GPT-5.5 when the signed-in
user has an OpenAI key, otherwise Claude with Opus 4.8 when they have an
Anthropic key.
If neither provider key is configured, creation fails with guidance.

Use `--base-branch` and `--title` to override those creation fields. Human
output includes the created session's full ID; `--json` prints one validated
session document for automation:

```sh
TOUGHCROWD_REPO=toughcrowdhq/app \
TOUGHCROWD_AGENT_PROFILE=codex-cli-default \
toughcrowd session new "Fix the flaky checkout test" --json
```

Choose a model or reasoning effort for one session with `--model` and
`--reasoning-effort`:

```sh
toughcrowd session new "Fix the flaky checkout test" --repo toughcrowdhq/app \
  --profile codex-cli-chatgpt --model gpt-5.6-sol --reasoning-effort high
```

Use `--no-defaults` to bypass `TOUGHCROWD_AGENT_PROFILE`, `TOUGHCROWD_MODEL`,
`TOUGHCROWD_REASONING_EFFORT`, and stored session preferences and request the
server/profile defaults. It cannot be combined with `--profile`, `--model`, or
`--reasoning-effort`.

## Machine-local session defaults

Store non-secret defaults for the current machine with:

```sh
toughcrowd agent-profile list
toughcrowd config set session.profile codex-cli-chatgpt
toughcrowd config set session.model gpt-5.6-sol
toughcrowd config set session.reasoning-effort high
toughcrowd config list
```

`agent-profile list --json` prints the executable profile catalog, including
profile IDs, supported models, profile defaults, authentication modes, and
supported reasoning efforts. `config set` checks selected combinations against
that authenticated catalog. Use `toughcrowd config unset <key>` to remove a
preference and `toughcrowd config path` to print its effective path. A stale
stored selection fails session creation with guidance instead of silently
falling back to another profile.

The versioned JSON file contains only these non-secret preferences—never API
keys or credentials. Its normal location is:

- macOS: `~/Library/Application Support/toughcrowd/config.json`
- Linux: `$XDG_CONFIG_HOME/toughcrowd/config.json`, or
  `~/.config/toughcrowd/config.json`
- Windows: `%APPDATA%\toughcrowd\config.json`

Set `TOUGHCROWD_CONFIG` to use an explicit file path. Config updates create
parent directories and are written atomically.

To associate new coding-agent work with a Tough Crowd issue before it is
queued, pass that issue's full ID:

```sh
toughcrowd session new "Fix the saved-card checkout failure" \
  --repo toughcrowdhq/app \
  --issue-id 11111111-1111-4111-8111-111111111111
```

List the newest page of sessions visible to the authenticated user:

```sh
toughcrowd session list
toughcrowd session list --status running --repo acme/web
toughcrowd session list --status needs_input
toughcrowd session list --status awaiting_checks
```

Human output includes each session's full ID so rows remain unambiguous and the
identifier can be copied directly into other commands. The `needs_input` and
`awaiting_checks` API statuses are shown as `Needs input` and
`Waiting for checks`.

Use `--limit <count>` to request between 1 and 100 sessions. When another page
exists, human output prints a follow-up command containing the opaque cursor;
pass it back unchanged with `--cursor <cursor>`. The command does not silently
fetch every page.

For automation, `--json` prints one validated document containing `sessions`,
`counts`, and `pageInfo`:

```sh
toughcrowd session list --limit 25 --json
```

Stop active work with the full session ID shown by `session list`:

```sh
toughcrowd session cancel <session-id>
```

Once a session with a pull request is review-ready, abandon it explicitly when
the generated changes will not be shipped:

```sh
toughcrowd session abandon <session-id>
```

Both commands accept `--json` for a bounded response containing only the
session ID and resulting status. They do not select a recent session
implicitly or prompt interactively, so scripts always act on an explicit ID.

## Issues

Capture and inspect Tough Crowd issues with the singular `issue` namespace:

```sh
toughcrowd issue new "Production checkout fails for saved cards" \
  --repository-id 22222222-2222-4222-8222-222222222222 \
  --type bug --priority high
toughcrowd issue list --state open
toughcrowd issue show <issue-id>
toughcrowd issue comment <issue-id> "The failure reproduces when the saved card has expired."
toughcrowd issue comment <issue-id> "Automated observation" --json
toughcrowd issue summary --created-from 2026-08-01T00:00:00.000Z
```

Issue updates use optimistic concurrency. Pass the current value shown by
`issue show` or `issue list` with `--issue-version`:

```sh
toughcrowd issue update <issue-id> --issue-version 3 --title "Checkout retry failure"
toughcrowd issue update <issue-id> --issue-version 4 --type bug --priority high
toughcrowd issue update <issue-id> --issue-version 5 --priority none
toughcrowd issue resolve <issue-id> --issue-version 6 --disposition fixed
toughcrowd issue reopen <issue-id> --issue-version 7
toughcrowd issue verify <issue-id> --issue-version 7 \
  --result passed --environment production
```

Issue types are `bug`, `feature`, or `task`. Priorities are `urgent`, `high`,
`medium`, or `low`. Both flags work with `issue new` and `issue update`; pass
`--priority none` to create an issue without a priority or clear the current
priority. When only one update categorization flag is supplied, the CLI
preserves the issue's other categorization values.

Link delivery work and optional GitHub issue synchronization explicitly:

```sh
toughcrowd issue attach-session <issue-id> <session-id> \
  --issue-version 2 --role implemented
toughcrowd issue detach-session <issue-id> <session-id> --issue-version 3
toughcrowd issue mirror-github <issue-id>
toughcrowd issue adopt-github <issue-id> \
  --scope-id <github-repository-id> --external-id <github-issue-id> \
  --key '#42' --url https://github.com/acme/web/issues/42
toughcrowd issue retry-github <issue-id>
toughcrowd issue unlink-github <issue-id>
```

Every bounded issue command accepts `--json`. API responses are validated and
projected to documented client-facing fields before they are printed.

Issue comments are append-only. Add an optional associated session with
`--session-id`; all comments and their current capacity are visible through
`issue show`.

## Incidents

Use the Incident Repository workflow for externally observed incidents:

```sh
toughcrowd incident create "Checkout API is returning 503s" \
  --title "Checkout outage" --repo acme/web --severity p1 \
  --started-at 2026-09-02T09:00:00-07:00 \
  --detected-at 2026-09-02T09:05:00-07:00
toughcrowd incident list --state active --severity p1 --repo acme/web
toughcrowd incident get <incident-id> --limit 25
toughcrowd incident update <incident-id> \
  --state resolved --resolution-summary "Rolled back the bad deployment" \
  --resolved-at 2026-09-02T10:15:00-07:00
toughcrowd incident update <incident-id> --state active
toughcrowd incident note <incident-id> "First customer report arrived at 20:03Z."
toughcrowd incident note update <incident-id> <note-id> "Corrected timestamp."
toughcrowd incident note delete <incident-id> <note-id>
toughcrowd incident component list
toughcrowd incident component create "Checkout API" \
  --description "Customer-facing checkout requests"
toughcrowd incident component update <component-id> --archive
```

`incident create` resolves the repository from `--repo`, then
`TOUGHCROWD_REPO`, then a recognizable GitHub HTTPS or SSH `origin` remote.
`incident list --repo` is only an explicit exact filter and does not infer from
the environment or Git. `incident update` changes repository only when `--repo`
is passed.

Severity values are `p0`, `p1`, `p2`, `p3`, and `unclassified`. State values
are `active` and `resolved`. Resolve and reopen incidents with
`incident update`; there are no separate resolve or reopen commands.

Operational time options are `--started-at`, `--detected-at`, `--mitigated-at`,
and `--resolved-at`. Values must be ISO 8601 timestamps with an explicit offset
and are normalized to UTC. Each has a corresponding `--clear-...` option for
recording that the time is unknown. Resolving without `--resolved-at` uses the
server time; `--clear-resolved-at` records an intentionally unknown resolution
time. Reopening clears the mitigation and resolution fields.

Use `incident component list` to discover component IDs. Organization Admins
can create, edit, archive, and unarchive components. Add impacts during create,
or replace the complete impact set during update, with `--impacts <json>`:

```sh
toughcrowd incident update <incident-id> --impacts \
  '[{"componentId":"<component-id>","condition":"partial_outage"}]'
toughcrowd incident update <incident-id> --impacts '[]'
```

Impact conditions are `unknown`, `degraded`, `partial_outage`, and
`unavailable`. When the organization has no configured components, omit
`componentId` to record a system-wide impact. Once components exist, impacts
must select an active component. Updating impacts replaces the entire set;
`[]` clears it.

Every incident operation accepts `--json`. Human output strips terminal control
characters and prints lifecycle state, severity, operational timestamps,
component impacts, attribution, and note bodies as server-provided incident
content. Incident notes support report-grade Markdown up to 256 KiB each when
encoded as UTF-8; summaries and resolution summaries remain limited to 10,000
characters. The service permits up to 10 MiB of notes per incident.
`incident get` combines the current incident detail with one bounded
chronological notes page and prints `nextCursor` when more notes are available.
Pass `--limit <count>` from 1 to 100 and return opaque cursors unchanged with
`--cursor`.

Incident and note updates are last-write-wins. Note deletion is permanent and
returns the deleted incident and note IDs when `--json` is used. The CLI does not accept expected
version flags, create incident-specific idempotency keys, retry POST requests,
cache disabled-feature decisions, store local incident data, retain note
revisions, poll, schedule work, add memory commands, or connect incidents to
sessions. If a create or note POST returns an ambiguous network or timeout
failure, read the incident or note state before retrying.

## Deployments

Report a successful production deployment after GitHub Actions health checks succeed:

```sh
toughcrowd deploy report
```

The command reads `GITHUB_REPOSITORY`, `GITHUB_SHA`, `GITHUB_RUN_ID`,
`GITHUB_RUN_ATTEMPT`, and `GITHUB_SERVER_URL`, then calls the Tough Crowd API
with a deterministic GitHub Actions source identity. Production is implicit for
this MVP; there are no environment or application URL flags.

Human output names the repository, deployed commit SHA, and asynchronous
reconciliation state. Use `--json` to print the decoded API response for
automation.

## Releases

CLI releases use Changesets, protected `v<version>` Git tags, and npm Trusted
Publishing with GitHub OIDC. See
[`.agents/releasing.md`](.agents/releasing.md)
for the release policy and first-release bootstrap notes.

## Architecture boundary

This repository contains only the public CLI. It communicates through Tough
Crowd's public HTTP API and must not depend on the private application database,
worker, infrastructure, or sandbox-provider implementations.

## License

Licensed under the [Apache License 2.0](LICENSE).
