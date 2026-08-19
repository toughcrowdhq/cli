import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "../cli.js";
import type { FetchLike } from "../api/request.js";
import type { CredentialStore } from "../auth/credentials.js";

const issueId = "11111111-1111-4111-8111-111111111111";
const repositoryId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const relationshipId = "44444444-4444-4444-8444-444444444444";
const resolutionEventId = "55555555-5555-4555-8555-555555555555";
const verificationId = "66666666-6666-4666-8666-666666666666";
const linkId = "77777777-7777-4777-8777-777777777777";
const commandId = "88888888-8888-4888-8888-888888888888";

const issueNamespaceHelp =
  [
    "Usage: toughcrowd issue [options] [command]",
    "",
    "Work with Tough Crowd issues",
    "",
    "Options:",
    "  -h, --help                                        display help for command",
    "",
    "Commands:",
    "  list [options]                                    List issues",
    "  new [options] <description>                       Create an issue",
    "  show [options] <issue-id>                         Show issue detail",
    "  update [options] <issue-id>                       Update an issue",
    "  resolve [options] <issue-id>                      Resolve an issue",
    "  reopen [options] <issue-id>                       Reopen an issue",
    "  verify [options] <issue-id>                       Record production verification",
    "  attach-session [options] <issue-id> <session-id>  Attach a session to an issue",
    "  detach-session [options] <issue-id> <session-id>  Detach a session from an issue",
    "  mirror-github [options] <issue-id>                Request a linked GitHub issue",
    "  adopt-github [options] <issue-id>                 Link an existing GitHub issue",
    "  retry-github [options] <issue-id>                 Retry GitHub issue synchronization",
    "  unlink-github [options] <issue-id>                Remove the GitHub issue link",
    "  summary [options]                                 Summarize issue outcomes",
    "  help [command]                                    display help for command",
  ].join("\n") + "\n";

describe("issue commands", () => {
  it("prints literal namespace help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["issue", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(issueNamespaceHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("routes every issue command to its public API operation", async () => {
    const fetch = createIssueFetch();
    const invocations: readonly (readonly string[])[] = [
      [
        "issue",
        "list",
        "--state",
        "open",
        "--repository-id",
        repositoryId,
        "--json",
      ],
      [
        "issue",
        "new",
        "Production checkout fails.",
        "--repository-id",
        repositoryId,
        "--title",
        "Checkout failure",
        "--mirror-github",
        "--json",
      ],
      ["issue", "show", issueId, "--json"],
      [
        "issue",
        "update",
        issueId,
        "--issue-version",
        "1",
        "--title",
        "Updated",
        "--json",
      ],
      [
        "issue",
        "resolve",
        issueId,
        "--issue-version",
        "2",
        "--disposition",
        "fixed",
        "--json",
      ],
      ["issue", "reopen", issueId, "--issue-version", "3", "--json"],
      [
        "issue",
        "verify",
        issueId,
        "--issue-version",
        "4",
        "--result",
        "passed",
        "--environment",
        "production",
        "--json",
      ],
      [
        "issue",
        "attach-session",
        issueId,
        sessionId,
        "--issue-version",
        "5",
        "--role",
        "implemented",
        "--json",
      ],
      [
        "issue",
        "detach-session",
        issueId,
        sessionId,
        "--issue-version",
        "6",
        "--json",
      ],
      ["issue", "mirror-github", issueId, "--json"],
      [
        "issue",
        "adopt-github",
        issueId,
        "--scope-id",
        "123",
        "--external-id",
        "456",
        "--key",
        "#42",
        "--url",
        "https://github.com/acme/web/issues/42",
        "--provider-state",
        '{"locked":false}',
        "--json",
      ],
      ["issue", "retry-github", issueId, "--json"],
      ["issue", "unlink-github", issueId, "--json"],
      [
        "issue",
        "summary",
        "--repository-id",
        repositoryId,
        "--created-from",
        "2026-08-01T00:00:00.000Z",
        "--json",
      ],
    ];

    for (const args of invocations) {
      const runtime = createAuthenticatedRuntime(fetch);
      expect(await runCli(args, runtime)).toBe(0);
      expect(runtime.stderr.output).toBe("");
    }

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      [
        "GET",
        `https://api.toughcrowd.dev/api/issues?repositoryId=${repositoryId}&state=open`,
      ],
      ["POST", "https://api.toughcrowd.dev/api/issues"],
      ["GET", `https://api.toughcrowd.dev/api/issues/${issueId}`],
      ["PATCH", `https://api.toughcrowd.dev/api/issues/${issueId}`],
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/resolution`],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/resolution?version=3`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/verifications`,
      ],
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/sessions`],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/sessions/${sessionId}?version=6`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github/adopt`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github/retry`,
      ],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github`,
      ],
      [
        "GET",
        `https://api.toughcrowd.dev/api/issues/summary?repositoryId=${repositoryId}&createdFrom=2026-08-01T00%3A00%3A00.000Z`,
      ],
    ]);
    expect(fetch.calls[1].idempotencyKey).toBe("issue-idempotency-key");
    expect(fetch.calls[10].body).toEqual({
      externalScopeId: "123",
      externalIssueId: "456",
      externalKey: "#42",
      url: "https://github.com/acme/web/issues/42",
      providerState: { locked: false },
    });
  });

  it("rejects invalid versions, choices, timestamps, and provider state before requesting", async () => {
    const fetch = createIssueFetch();
    const invalidInvocations = [
      ["issue", "reopen", issueId, "--issue-version", "0"],
      [
        "issue",
        "resolve",
        issueId,
        "--issue-version",
        "1",
        "--disposition",
        "done",
      ],
      ["issue", "summary", "--created-from", "yesterday"],
      [
        "issue",
        "adopt-github",
        issueId,
        "--scope-id",
        "123",
        "--external-id",
        "456",
        "--key",
        "#42",
        "--url",
        "https://github.com/acme/web/issues/42",
        "--provider-state",
        "[]",
      ],
    ];

    for (const args of invalidInvocations) {
      const runtime = createAuthenticatedRuntime(fetch);
      expect(await runCli(args, runtime)).toBe(2);
    }
    expect(fetch.calls).toEqual([]);
  });

  it("fails before a request when no credential is available", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["issue", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Not authenticated for https://api.toughcrowd.dev. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.\n",
    );
  });

  it("does not expose server details from 5xx or malformed success responses", async () => {
    const serverFailure = createAuthenticatedRuntime(
      createStaticFetch(
        {
          error: {
            code: "internal-error",
            message: "Database production-primary failed.",
          },
        },
        500,
      ),
    );
    const malformed = createAuthenticatedRuntime(
      createStaticFetch({ issues: [{ id: "not-a-uuid" }] }),
    );

    expect(await runCli(["issue", "list"], serverFailure)).toBe(1);
    expect(await runCli(["issue", "list"], malformed)).toBe(1);
    expect(serverFailure.stderr.output).toBe(
      "Could not list issues: the Tough Crowd API returned an internal error.\n",
    );
    expect(serverFailure.stderr.output).not.toContain("production-primary");
    expect(malformed.stderr.output).toBe(
      "Could not list issues: the Tough Crowd API returned an invalid response.\n",
    );
  });
});

function createRuntime(): CliRuntime & {
  stdout: MemoryWriter;
  stderr: MemoryWriter;
} {
  return {
    stdout: new MemoryWriter(),
    stderr: new MemoryWriter(),
    version: "0.4.0-test",
    signal: new AbortController().signal,
    env: {},
    credentialStore: createMemoryCredentialStore(),
  };
}

function createAuthenticatedRuntime(
  fetch: FetchLike,
): CliRuntime & { stdout: MemoryWriter; stderr: MemoryWriter } {
  return {
    ...createRuntime(),
    env: { TOUGHCROWD_API_KEY: "tc_secret" },
    fetch,
    createIdempotencyKey: () => "issue-idempotency-key",
  };
}

class MemoryWriter {
  output = "";

  write(value: string): void {
    this.output += value;
  }
}

function createMemoryCredentialStore(): CredentialStore {
  return {
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
  };
}

interface FetchCall {
  method: string;
  url: string;
  body?: unknown;
  idempotencyKey?: string;
}

function createIssueFetch(): FetchLike & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImplementation = ((url: URL, init: RequestInit) => {
    const body: unknown =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const call = {
      method: init.method ?? "GET",
      url: url.toString(),
      ...(body === undefined ? {} : { body }),
      idempotencyKey:
        new Headers(init.headers).get("idempotency-key") ?? undefined,
    };
    calls.push(call);
    return Promise.resolve(
      new Response(JSON.stringify(responseFor(call)), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as FetchLike & { calls: FetchCall[] };
  fetchImplementation.calls = calls;
  return fetchImplementation;
}

function createStaticFetch(body: unknown, status = 200): FetchLike {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

function responseFor(call: FetchCall): unknown {
  const issue = createIssueRecord();
  if (call.url.includes("/summary")) return createSummaryResponse();
  if (call.url.endsWith("/verifications")) {
    return { verification: createVerification() };
  }
  if (call.url.includes(`/sessions/${sessionId}`)) return { detached: 1 };
  if (call.url.endsWith("/sessions")) {
    return { relationship: createRelationship() };
  }
  if (call.url.endsWith("/adopt")) {
    return { link: createExternalLink(), command: null };
  }
  if (call.url.endsWith("/retry")) return { retried: 1 };
  if (call.url.endsWith("/external-links/github")) {
    return call.method === "DELETE"
      ? { unlinked: 1 }
      : { link: null, command: createGitHubCommand() };
  }
  if (call.url.endsWith("/resolution") || call.url.includes("/resolution?")) {
    return { issue };
  }
  if (call.url.endsWith(`/issues/${issueId}`)) {
    return call.method === "GET" ? createDetailResponse() : { issue };
  }
  if (call.url.includes("/api/issues?")) return { issues: [issue] };
  return { issue, titlingState: "ready" };
}

function createIssueRecord() {
  return {
    id: issueId,
    githubRepositoryId: repositoryId,
    title: "Checkout failure",
    description: "Production checkout fails.",
    state: "open",
    resolutionDisposition: null,
    resolutionNote: null,
    version: 1,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:01:02.000Z",
    repositoryFullName: "acme/web",
    relationships: [],
    verifications: [],
    externalLinks: [],
  };
}

function createRelationship() {
  return {
    id: relationshipId,
    issueId,
    sessionId,
    role: "implemented",
    createdAt: "2026-08-18T20:02:00.000Z",
    detachedAt: null,
  };
}

function createVerification() {
  return {
    id: verificationId,
    issueId,
    resolutionEventId,
    sessionId: null,
    deploymentEvidenceId: null,
    environment: "production",
    result: "passed",
    note: null,
    verifiedAt: "2026-08-18T20:03:00.000Z",
  };
}

function createExternalLink() {
  return {
    id: linkId,
    issueId,
    provider: "github",
    externalScopeId: "123",
    externalIssueId: "456",
    externalKey: "#42",
    url: "https://github.com/acme/web/issues/42",
    externalTitle: "GitHub title",
    externalStateCategory: "open",
    syncState: "synced",
    lifecycleSyncState: "in_sync",
  };
}

function createGitHubCommand() {
  return {
    id: commandId,
    issueId,
    provider: "github",
    operation: "create",
    state: "pending",
  };
}

function createDetailResponse() {
  return {
    issue: createIssueRecord(),
    events: [
      {
        id: resolutionEventId,
        issueId,
        eventType: "issue.created",
        origin: "local",
        createdAt: "2026-08-18T20:01:02.000Z",
      },
    ],
    relationships: [],
    verifications: [],
    externalLinks: [],
    repository: {
      id: repositoryId,
      fullName: "acme/web",
      defaultBranch: "main",
    },
  };
}

function createSummaryResponse() {
  const empty = { count: 0, issueIds: [] };
  return {
    range: { createdFrom: null, createdTo: null, durationMs: null },
    created: { count: 1, issueIds: [issueId] },
    fixed: empty,
    fixedAndVerified: empty,
    nonFixed: empty,
    mergedUnverified: empty,
    deployedUnverified: empty,
  };
}
