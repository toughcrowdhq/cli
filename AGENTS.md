# Agent Guide

This repository contains the public Tough Crowd command-line client.

## Start Here

Read these files before making product or architecture changes:

- `.agents/architecture.md` — repository purpose, public API boundary, and
  durable CLI decisions.
- `.agents/testing.md` — test and package-artifact verification conventions.
- `.agents/releasing.md` — versioning, release security, and first-publish
  rules.
- `.agents/projects/README.md` — project workspace conventions.

## Product Thesis

Tough Crowd supervises coding-agent work in cloud sandboxes and helps people
decide what is safe to ship.

Describe the product in terms of coding-agent work, sessions, generated
changes, and human review. Avoid metaphorical room language for the product or
its UI.

The CLI is a client of that product. It is not a coding agent and does not own
the hosted control plane.

## Non-Negotiables

- Keep the CLI TypeScript-first and support the Node.js range in `package.json`.
- Install only the canonical `toughcrowd` executable. Do not add `crowd` as an
  alias.
- Communicate through public HTTP contracts or a separately publishable API
  client.
- Do not copy or depend on private application database schemas, worker code,
  infrastructure code, sandbox-provider implementations, or server-only
  packages.
- Keep package and executable behavior compatible according to
  `.agents/releasing.md`.
- Never store a long-lived npm publishing token. Releases use npm Trusted
  Publishing with GitHub OIDC.
- Never auto-merge generated changes or create release tags without explicit
  maintainer direction.
- Never commit credentials, customer data, or private application code.

## Commands

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm smoke:package
```
