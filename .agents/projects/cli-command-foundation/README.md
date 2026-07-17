# Project: CLI Command Foundation

## Goal

Replace the initial greeting scaffold with the production command, process,
error, and test boundaries that every Tough Crowd CLI command will use.

## Context

The published package currently proves installation and version reporting, but
its default behavior is still `Hello, world!`. Before authentication or
API-backed commands are added, the CLI needs a real Commander root, an
asynchronous process boundary, injected runtime capabilities, stable usage
behavior, and signal propagation.

This project implements the command foundation described in
[`../../architecture.md`](../../architecture.md). Commander remains a thin
adapter over future application operations. This project does not create empty
session or authentication commands and does not introduce abstractions that no
implemented behavior exercises.

## Scope

- Add `commander` as a runtime dependency.
- Replace the synchronous `run` scaffold with an asynchronous `runCli`
  boundary that accepts arguments and injected runtime capabilities and
  resolves to an exit code.
- Add a Commander root program with canonical name, description, version,
  help, and strict handling of unknown commands, unknown options, and excess
  arguments.
- Make invocation without a command print root help successfully.
- Keep stdout and stderr separate and injectable.
- Centralize translation of Commander exits and unexpected failures into
  stable process behavior.
- Have the executable entry point own `process.argv`, signal handling, and
  assignment of `process.exitCode` without calling `process.exit()`.
- Propagate one abort signal for `SIGINT` and `SIGTERM` so future commands can
  use the same cancellation path.
- Update literal-output tests and installed-package smoke verification for the
  new root behavior.
- Add a Changeset for the user-visible replacement of the greeting scaffold.

## Out Of Scope

- Public API or generated API-client code.
- Authentication, credential storage, or browser and device login.
- Session, repository, Agent Profile, configuration, or TUI commands.
- Human, JSON, or JSONL domain presenters that are not yet exercised by a
  command.
- Repository config discovery or CLI-version compatibility enforcement.
- Shell completion, update checks, telemetry, plugins, or standalone binaries.
- Final operational exit codes for API, authentication, or configuration
  failures; those categories should be added when their behavior exists.

## Checklist

- [x] Add `commander` to runtime dependencies and commit the lockfile update.
- [x] Introduce the injected `CliRuntime` capabilities needed by the root
      command and process boundary.
- [x] Implement `runCli(args, runtime): Promise<number>` without reading global
      process state or terminating the process.
- [x] Configure the Commander root name, description, version, help text, help
      destination, and exit override.
- [x] Make an empty argument list behave like root `--help` and return success.
- [x] Return exit code `0` for help and version and `2` for command-line usage
      errors.
- [x] Route ordinary results and help to stdout and usage diagnostics to
      stderr.
- [x] Reject unknown commands, unknown options, and excess arguments with
      literal, tested diagnostics.
- [x] Keep `src/index.ts` limited to package-version loading, process streams,
      signal wiring, invoking `runCli`, and assigning `process.exitCode`.
- [x] Pass one `AbortSignal` through the runtime and map an observed process
      interruption to exit code `130` without printing an internal stack
      trace.
- [x] Preserve concise diagnostics and exit code `1` for unexpected root-level
      failures while keeping stack traces out of normal user output.
- [x] Replace the existing greeting tests with literal assertions for root
      help, `--help`, `--version`, usage errors, stdout, stderr, and exit codes.
- [x] Update the package smoke test to verify installed root help and version
      behavior instead of `Hello, world!`.
- [x] Update public README examples that still describe the greeting scaffold.
- [x] Add a Changeset describing the new command foundation.
- [x] Run `pnpm format:check`, lint, typecheck, tests, build, and
      installed-package smoke verification.

## Acceptance Criteria

- Running `toughcrowd` and `toughcrowd --help` prints the same literal root help
  to stdout and exits with code `0`.
- Running `toughcrowd --version` prints exactly the package version followed by
  a newline and exits with code `0`.
- Unknown commands, unknown options, and excess positional arguments write no
  command result to stdout, write an actionable diagnostic to stderr, and exit
  with code `2`.
- `runCli` can be exercised repeatedly in one test process with injected
  streams and without mutating global process state or terminating the test
  runner.
- `SIGINT` and `SIGTERM` abort the shared signal path, and interruption can
  produce exit code `130` without an uncaught exception or stack trace.
- The packed artifact installs only the canonical `toughcrowd` executable, and
  the installed executable passes the root-help and version smoke checks.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm smoke:package` pass.
