# Changesets

User-visible CLI changes must include a Changeset for `@toughcrowd/cli`:

```sh
pnpm changeset
```

Before 1.0, choose `patch` for backward-compatible fixes and `minor` for new
features or breaking changes. Refactors, tests, documentation, and build-only
changes do not require a Changeset.

The initial unpublished `0.1.0` scaffold is the release baseline and is exempt.
The release-PR workflow consumes pending Changesets. Do not run
`pnpm changeset:version` on ordinary feature branches.
