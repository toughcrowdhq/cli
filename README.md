# Tough Crowd CLI

The public command-line client for Tough Crowd, which supervises coding-agent
work in cloud sandboxes and helps people decide what is safe to ship.

Version 0.1 is an intentionally small runnable scaffold. It prints
`Hello, world!` while the public API-backed commands are developed.

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
Hello, world!
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

## Releases

CLI releases use Changesets, protected `v<version>` Git tags, and npm Trusted
Publishing with GitHub OIDC. See
[`.agents/projects/cli-versioning-and-publishing/README.md`](.agents/projects/cli-versioning-and-publishing/README.md)
for the activation checklist and first-release bootstrap.

## Architecture boundary

This repository contains only the public CLI. It communicates through Tough
Crowd's public HTTP API and must not depend on the private application database,
worker, infrastructure, or sandbox-provider implementations.

## License

Licensed under the [Apache License 2.0](LICENSE).
