# Contributing

Thanks for improving the Tough Crowd CLI.

## Development

Use Node.js 22.14 or newer and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm smoke:package
```

Keep the CLI behind Tough Crowd's public HTTP API boundary. Do not copy private
application, database, worker, infrastructure, or sandbox-provider code into
this repository.

User-visible changes after the initial `0.1.0` baseline require a Changeset:

```sh
pnpm changeset
```

Before 1.0, use a patch Changeset for compatible fixes and a minor Changeset
for new features or breaking changes.

All changes require human review. Release tags and npm publishing are reserved
for maintainers.
