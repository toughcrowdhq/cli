# Releasing

## Release Model

- `package.json` owns the version.
- Stable releases on the current release line use the npm `latest` dist-tag.
- Prereleases such as `0.2.0-beta.1` use `next`.
- Git tags use `v<version>` and must match the package version exactly.
- User-visible changes carry a Changeset.
- Release PRs update the version and `CHANGELOG.md`.
- Publishing runs only from protected release tags.
- npm authentication uses Trusted Publishing with GitHub OIDC.
- Do not create or store `NPM_TOKEN` or another long-lived publish token.

After merging a Changesets release PR, update local `main` and run:

```sh
pnpm release
```

This is the maintainer's explicit release gate. It refuses to run unless `main`
is clean and synchronized with `origin/main`, validates the package version and
changelog, runs the full release checks, asks for confirmation, creates the
annotated `v<version>` tag, and pushes only that tag. The tag-triggered workflow
publishes through npm Trusted Publishing and creates the GitHub Release. Do not
run `npm publish` manually after the `0.1.0` bootstrap.

The public repository enables npm provenance for OIDC-published releases. The
first package version is the exception: npm cannot configure a trusted
publisher or staged publish for a package that does not yet exist, so `0.1.0`
must be bootstrapped interactively from its exact local tag with maintainer 2FA.

## Supported Release Lines

Before 1.0, the current minor line is supported. Older 0.x minor lines are not
maintained by default because minor releases may contain breaking changes.

After 1.0:

- The current major line receives features, bug fixes, and security fixes.
- The immediately previous major line is eligible for critical and security
  fixes for 90 days after the next major becomes generally available.
- Older major lines are unsupported unless an exceptional disclosure response
  requires a narrowly scoped fix.

This window limits which releases may receive fixes; it is not a promise to
backport every bug. Extend a support window only through an explicit documented
decision.

Normal releases come from `main`. When a supported older line needs a fix:

1. Create or reuse `release/<major>.x` from the newest tag on that line.
2. Backport the fix and publish a new patch version from that branch.
3. Publish the current-line fix separately from `main` when it is also affected.
4. Keep the current stable line on `latest`. Publish the older line with an
   explicit `maintenance-<major>` dist-tag; never move `latest` backward.
5. Create `v<version>` tags and GitHub Releases for every fixed version, and
   identify all fixed and affected versions in the security advisory.

npm versions are immutable, and globally installed CLIs do not update
automatically. Never overwrite a release; publish a new version and tell users
which version to install.

The initial release automation supports one current stable line and one
prerelease line. Before the first maintenance-line publish, extend and test the
release policy and Changesets workflow so maintenance branches select their
explicit dist-tags instead of `latest`. Do not use the current stable workflow
unchanged to publish an older release line.

## Compatibility

Treat these as public contracts:

- Command names and aliases.
- Flags and defaults.
- Exit codes.
- Environment variables.
- Configuration paths and formats.
- Standard output and standard error behavior.
- Machine-readable output schemas.

## Bad Releases

Never reuse an npm package name and version. For an ordinary defect, deprecate
the bad version when useful, move the dist-tag if necessary, and publish a new
version. Unpublish only for exceptional exposure such as credentials or private
data, and rotate exposed credentials immediately.
