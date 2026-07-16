# Testing Guidelines

Tests are the primary review surface for CLI behavior. Expected values should
be literal and human-evaluable, especially for terminal output, exit behavior,
and machine-readable contracts.

## Required Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:package
```

## Unit Tests

- Keep tests beside the source they cover.
- Assert literal output, exit codes, and parsed values rather than deriving
  expectations from implementation helpers.
- Prefer real filesystem and process boundaries when they are deterministic and
  disposable.
- Mock external network APIs, interactive browser flows, time, or randomness
  only when the real boundary would be slow, destructive, paid, or
  nondeterministic.
- Do not use snapshots for internal data structures.

## Package Smoke Test

`pnpm smoke:package` is a release gate. It must:

- Pack the exact npm artifact.
- Reject unexpected files.
- Install the tarball into a temporary prefix.
- Verify that only `toughcrowd` is installed.
- Execute the installed binary.
- Verify `--version` and the default command output.

Test the tarball rather than only `dist`; package metadata, file inclusion, the
shebang, and executable permissions are part of the product.
