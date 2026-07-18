# Tough Crowd CLI

The public command-line client for Tough Crowd, which supervises coding-agent
work in cloud sandboxes and helps people decide what is safe to ship.

Version 0.1 provides the command foundation and API-key authentication while
the first session commands are developed.

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
pnpm build
pnpm start
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

Use an API key from the Tough Crowd web app:

```sh
toughcrowd auth login
toughcrowd auth status
```

`auth login` prints the API-key page URL, opens it when possible, reads the key
through a hidden TTY prompt, validates it, and stores it in the operating-system
credential store for the current API origin.

For non-interactive environments, set `TOUGHCROWD_API_KEY`:

```sh
TOUGHCROWD_API_KEY=tc_... toughcrowd auth status
```

Environment credentials take precedence over stored credentials and are never
persisted. Override the API origin with `TOUGHCROWD_API_ORIGIN`; override the
web origin used for the login URL with `TOUGHCROWD_WEB_ORIGIN`.

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
