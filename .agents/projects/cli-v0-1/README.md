# Project: CLI v0.1

## Goal

Create the first runnable Tough Crowd CLI package and establish the durable
naming, repository, language, boundary, and distribution decisions future CLI
work follows.

## Context

The first release is intentionally a scaffold. It proves installation,
executable naming, version reporting, testing, and package verification before
public API-backed commands are added.

The canonical executable is `toughcrowd`. The generic `crowd` name is not
installed as an alias.

## Architecture Decisions

- Source: this public repository.
- Language: TypeScript on Node.js.
- Executable: `toughcrowd` only.
- npm package: `@toughcrowd/cli`.
- API boundary: public HTTP contracts or a public client package only.
- Initial distribution: npm.
- License: Apache-2.0.

## Scope

- Add the CLI package at version `0.1.0`.
- Add an executable entrypoint with a Node shebang.
- Print `Hello, world!` when the command runs.
- Print the package version for `--version` and `-v`.
- Test literal user-visible output.
- Verify the installed npm tarball.

## Out Of Scope

- Authentication and credential storage.
- API client generation.
- Session commands, streaming output, or repository detection.
- Standalone binaries or operating-system package managers.

## Checklist

- [x] Record the canonical `toughcrowd` executable decision.
- [x] Create the package at version `0.1.0`.
- [x] Add the runnable entrypoint.
- [x] Add literal-output tests.
- [x] Add `--version` and `-v`.
- [x] Add installed-tarball smoke verification.
- [x] Move the CLI into its public source repository.

## Acceptance Criteria

- Typecheck, tests, lint, build, and package smoke verification pass.
- Running the installed executable prints exactly `Hello, world!` followed by
  a newline.
- `--version` prints exactly `0.1.0` followed by a newline.
- The package exposes only `toughcrowd` in its `bin` map.
- The CLI has no dependency on private application packages.
