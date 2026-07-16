# Releasing

## Release Model

- `package.json` owns the version.
- Stable releases use the npm `latest` dist-tag.
- Prereleases such as `0.2.0-beta.1` use `next`.
- Git tags use `v<version>` and must match the package version exactly.
- User-visible changes carry a Changeset.
- Release PRs update the version and `CHANGELOG.md`.
- Publishing runs only from protected release tags.
- npm authentication uses Trusted Publishing with GitHub OIDC.
- Do not create or store `NPM_TOKEN` or another long-lived publish token.

The public repository enables npm provenance for OIDC-published releases. The
first package version is the exception: npm cannot configure a trusted
publisher or staged publish for a package that does not yet exist, so `0.1.0`
must be bootstrapped interactively from its exact local tag with maintainer 2FA.

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
