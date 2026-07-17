# Project: CLI Versioning And Publishing

## Goal

Create a deliberate, secure, and repeatable path for versioning and publishing
`@toughcrowd/cli` from its public repository without a long-lived npm token.

## Context

npm package versions are immutable. Stable releases use `latest`; prereleases
use `next`. npm Trusted Publishing authenticates GitHub Actions through OIDC and
provides provenance for packages built from this public repository.

npm cannot register a Trusted Publisher or stage a package that does not yet
exist. The first `0.1.0` publish is therefore a one-time interactive bootstrap
from the exact local release tag using a maintainer account with 2FA. Every
later release publishes through OIDC.

External protections must reflect the actual maintainer count. A solo
maintainer may be the only npm organization owner when the account uses 2FA and
has securely stored recovery methods. Do not create a fake or shared account to
satisfy a nominal owner count. While the project has one maintainer, the
`npm-production` environment restricts deployments to `v*` tags without an
impossible second-person review. Add a required reviewer and prevent self-review
when a second trusted release maintainer exists.

The long-term supported-release policy lives in `.agents/releasing.md`. The
initial automation intentionally supports the current stable line on `latest`
and prereleases on `next`; maintenance-line automation is activated only when a
supported older line actually needs a release.

## Release Flow

1. A user-visible change adds a Changeset.
2. `.github/workflows/cli-release-pr.yml` creates or updates the release PR.
3. A maintainer reviews and merges the release PR.
4. A release maintainer creates protected tag `v<version>` at that commit.
5. `.github/workflows/publish-cli.yml` validates the tag and metadata, runs all
   checks, builds, packs, installs, and executes the exact tarball.
6. The workflow publishes through npm Trusted Publishing and creates the
   matching GitHub Release.

### First Release Bootstrap

1. Complete the npm organization, GitHub environment, tag-ruleset, Actions,
   and private-vulnerability-reporting prerequisites.
2. Remove `private: true` and merge the reviewed release-ready package.
3. Create local annotated tag `v0.1.0` at that exact commit, but do not push it.
4. Check out the tag, install the frozen lockfile, and run formatting, lint,
   typecheck, tests, build, and package smoke verification.
5. Run `npm publish --access public --tag latest` interactively with maintainer
   2FA.
6. Register `publish-cli.yml` as the npm Trusted Publisher for
   `toughcrowdhq/cli`, restricted to environment `npm-production` and action
   `npm publish`.
7. Set package publishing access to require 2FA and disallow traditional
   publishing tokens.
8. Push `v0.1.0`. The workflow verifies the artifact, skips the already-live npm
   version, and creates the GitHub Release.

## Scope

- Configure Changesets.
- Add CI and release-PR automation.
- Add protected-tag publishing through GitHub OIDC.
- Validate tag, metadata, dist-tag, and tarball contents.
- Verify the installed executable.
- Document external activation settings.
- Document stable, prerelease, and future maintenance-line policy.

## Out Of Scope

- Creating or administering the npm organization.
- Changing GitHub environment, ruleset, Actions, or security settings.
- Registering the npm Trusted Publisher.
- Publishing the first release.
- Adding standalone binaries or non-npm distribution channels.
- Implementing maintenance-branch automation before a maintenance release is
  needed.

## Checklist

- [x] Record the independent SemVer and compatibility policy.
- [x] Configure Changesets and changelog generation.
- [x] Add continuous integration for the public repository.
- [x] Add automated release-PR workflow.
- [x] Add protected-tag publishing workflow with OIDC permissions.
- [x] Add strict tag, metadata, and dist-tag validation.
- [x] Add npm tarball and installed-binary verification.
- [x] Add the Apache-2.0 license and public repository metadata.
- [ ] Create or confirm the `@toughcrowd` npm organization, require 2FA for all
      owners, and securely store account recovery methods. One real owner is
      acceptable while the company has one maintainer; never add a fake or
      shared owner.
- [x] Enable GitHub Actions to create pull requests.
- [x] Enable private vulnerability reporting for the public repository.
- [x] Create GitHub environment `npm-production` and restrict deployments to
      `v*` tags. While there is one maintainer, do not require a reviewer; when
      a second trusted maintainer exists, require review and prevent self-review.
- [x] Create an active tag ruleset for `v*` that restricts creation, update, and
      deletion to release maintainers.
- [ ] Remove `private: true` after the external protections are complete.
- [ ] Create local tag `v0.1.0`, verify its exact artifact, and publish
      `@toughcrowd/cli@0.1.0` interactively with maintainer 2FA.
- [ ] Register `publish-cli.yml` as the npm Trusted Publisher for
      `toughcrowdhq/cli`, environment `npm-production`, action `npm publish`.
- [ ] Require 2FA and disallow traditional npm publishing tokens.
- [ ] Push `v0.1.0` and verify the idempotent workflow and GitHub Release.

## Acceptance Criteria

- CI runs formatting, lint, typecheck, tests, build, and installed-tarball smoke
  verification.
- Release PR automation versions only `@toughcrowd/cli`.
- A release tag that differs from `package.json` fails before npm access.
- A private, unlicensed, or incorrectly attributed package fails before npm
  access.
- Current-line stable versions resolve to `latest`; prereleases resolve to
  `next`; a future older-line maintenance release must use an explicit
  `maintenance-<major>` tag and must not move `latest` backward.
- The tarball contains only expected package files and compiled output.
- Installing the tarball exposes only `toughcrowd` and reports the exact
  package version.
- No npm publishing token is stored in GitHub Actions.

## References

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/policies/unpublish/
