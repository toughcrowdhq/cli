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
