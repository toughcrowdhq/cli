# Tough Crowd CLI

The public command-line client for Tough Crowd, which supervises coding-agent
work in cloud sandboxes and helps people decide what is safe to ship.

The CLI provides API-key authentication and the first read-only session
workflow.

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
  session         Work with Tough Crowd sessions
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

List the newest page of sessions visible to the authenticated user:

```sh
toughcrowd session list
toughcrowd session list --status running --repo acme/web
```

Human output includes each session's full ID so rows remain unambiguous and the
identifier can be copied directly into other commands.

Use `--limit <count>` to request between 1 and 100 sessions. When another page
exists, human output prints a follow-up command containing the opaque cursor;
pass it back unchanged with `--cursor <cursor>`. The command does not silently
fetch every page.

For automation, `--json` prints one validated document containing `sessions`,
`counts`, and `pageInfo`:

```sh
toughcrowd session list --limit 25 --json
```

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
