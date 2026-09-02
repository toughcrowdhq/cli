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
    "  comment [options] <issue-id> <body>               Add an append-only issue comment",
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

const issueNewHelp =
  [
    "Usage: toughcrowd issue new [options] <description>",
    "",
    "Create an issue",
    "",
    "Arguments:",
    "  description            issue description",
    "",
    "Options:",
    "  --repository-id <id>   repository ID",
    "  --title <title>        issue title",
    '  --type <type>          issue type (choices: "bug", "feature", "task")',
    '  --priority <priority>  issue priority (choices: "urgent", "high", "medium",',
    '                         "low", "none")',
    "  --mirror-github        also request a linked GitHub issue",
    "  --json                 print machine-readable JSON",
    "  -h, --help             display help for command",
  ].join("\n") + "\n";

const issueUpdateHelp =
  [
    "Usage: toughcrowd issue update [options] <issue-id>",
    "",
    "Update an issue",
    "",
    "Arguments:",
    "  issue-id                     issue ID",
    "",
    "Options:",
    "  --issue-version <number>     current issue version",
    "  --title <title>              new issue title",
    "  --description <description>  new issue description",
    '  --type <type>                new issue type (choices: "bug", "feature",',
    '                               "task")',
    '  --priority <priority>        new issue priority (choices: "urgent", "high",',
    '                               "medium", "low", "none")',
    "  --json                       print machine-readable JSON",
    "  -h, --help                   display help for command",
  ].join("\n") + "\n";

describe("issue commands", () => {
  it("prints literal namespace help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["issue", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(issueNamespaceHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("documents issue categorization update options", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["issue", "update", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(issueUpdateHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("documents issue categorization creation options", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["issue", "new", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(issueNewHelp);
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
        "--type",
        "bug",
        "--priority",
        "high",
        "--mirror-github",
        "--json",
      ],
      ["issue", "show", issueId, "--json"],
      ["issue", "comment", issueId, "Observed", "--json"],
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
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/comments`],
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
    expect(fetch.calls[1].body).toEqual({
      repositoryId,
      description: "Production checkout fails.",
      title: "Checkout failure",
      type: "bug",
      priority: "high",
      mirrorToGitHub: true,
    });
    expect(fetch.calls[11].body).toEqual({
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
        "new",
        "Invalid type",
        "--repository-id",
        repositoryId,
        "--type",
        "defect",
      ],
      [
        "issue",
        "new",
        "Invalid priority",
        "--repository-id",
        repositoryId,
        "--priority",
        "eventually",
      ],
      ["issue", "update", issueId, "--issue-version", "1", "--type", "defect"],
      [
        "issue",
        "update",
        issueId,
        "--issue-version",
        "1",
        "--priority",
        "eventually",
      ],
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

  it("prints a diagnostic when update has no changed fields", async () => {
    const fetch = createIssueFetch();
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(
      ["issue", "update", issueId, "--issue-version", "1"],
      runtime,
    );

    expect(exitCode).toBe(2);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "error: at least one of --title, --description, --type, or --priority is required\n",
    );
    expect(fetch.calls).toEqual([]);
  });

  it("updates type and priority while preserving unspecified categorization", async () => {
    const fetch = createIssueFetch({
      type: "task",
      priority: "medium",
    });
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(
      [
        "issue",
        "update",
        issueId,
        "--issue-version",
        "1",
        "--type",
        "bug",
        "--priority",
        "high",
        "--json",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(runtime.stderr.output).toBe("");
    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", `https://api.toughcrowd.dev/api/issues/${issueId}`],
      ["PATCH", `https://api.toughcrowd.dev/api/issues/${issueId}`],
    ]);
    expect(fetch.calls[1].body).toEqual({
      version: 1,
      categorization: { type: "bug", priority: "high" },
    });
  });

  it("creates an issue with explicitly unset priority", async () => {
    const fetch = createIssueFetch();
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(
      [
        "issue",
        "new",
        "Plan the migration",
        "--repository-id",
        repositoryId,
        "--type",
        "feature",
        "--priority",
        "none",
        "--json",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(runtime.stderr.output).toBe("");
    expect(fetch.calls[0].body).toEqual({
      repositoryId,
      description: "Plan the migration",
      type: "feature",
      priority: null,
      mirrorToGitHub: false,
    });
  });

  it("updates categorization without the retired severity field", async () => {
    const clearPriorityFetch = createIssueFetch({
      type: "bug",
      priority: "urgent",
    });
    const clearPriorityRuntime = createAuthenticatedRuntime(clearPriorityFetch);
    expect(
      await runCli(
        [
          "issue",
          "update",
          issueId,
          "--issue-version",
          "1",
          "--priority",
          "none",
        ],
        clearPriorityRuntime,
      ),
    ).toBe(0);
    expect(clearPriorityFetch.calls[1].body).toEqual({
      version: 1,
      categorization: { type: "bug", priority: null },
    });

    const changeTypeFetch = createIssueFetch({
      type: "bug",
      priority: "urgent",
    });
    const changeTypeRuntime = createAuthenticatedRuntime(changeTypeFetch);
    expect(
      await runCli(
        [
          "issue",
          "update",
          issueId,
          "--issue-version",
          "1",
          "--type",
          "feature",
        ],
        changeTypeRuntime,
      ),
    ).toBe(0);
    expect(changeTypeFetch.calls[1].body).toEqual({
      version: 1,
      categorization: {
        type: "feature",
        priority: "urgent",
      },
    });
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

  it("trims comments, generates one idempotency key, and prints safe output", async () => {
    const fetch = createIssueFetch();
    let keys = 0;
    const runtime = {
      ...createAuthenticatedRuntime(fetch),
      createIdempotencyKey: () => {
        keys += 1;
        return "comment-key";
      },
    };
    expect(
      await runCli(
        ["issue", "comment", issueId, "  first\\nsecond\\u001b[31m  "],
        runtime,
      ),
    ).toBe(0);
    expect(keys).toBe(1);
    expect(fetch.calls[0]).toMatchObject({
      body: { body: "first\\nsecond\\u001b[31m" },
      idempotencyKey: "comment-key",
    });
    expect(runtime.stdout.output).toContain("Issue comment created\n");
    expect(runtime.stdout.output).not.toContain("\u001b");
  });

  it("rejects invalid comment bodies before fetching", async () => {
    const fetch = createIssueFetch();
    for (const body of ["   ", "a".repeat(10_001), "😀".repeat(10_001)]) {
      const runtime = createAuthenticatedRuntime(fetch);
      expect(await runCli(["issue", "comment", issueId, body], runtime)).toBe(
        1,
      );
    }
    expect(fetch.calls).toEqual([]);
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

function createIssueFetch(
  issueOverrides: Record<string, unknown> = {},
): FetchLike & { calls: FetchCall[] } {
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
      new Response(JSON.stringify(responseFor(call, issueOverrides)), {
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

function responseFor(
  call: FetchCall,
  issueOverrides: Record<string, unknown>,
): unknown {
  const issue = createIssueRecord(issueOverrides);
  if (call.url.endsWith("/comments")) return { comment: createComment() };
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
    return call.method === "GET"
      ? createDetailResponse(issueOverrides)
      : { issue };
  }
  if (call.url.includes("/api/issues?")) return { issues: [issue] };
  return { issue, titlingState: "ready" };
}

function createIssueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    githubRepositoryId: repositoryId,
    title: "Checkout failure",
    description: "Production checkout fails.",
    type: "task",
    priority: null,
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
    comments: [],
    commentCapacity: {
      count: 0,
      countLimit: 500,
      serializedBodyBytes: 0,
      serializedBodyBytesLimit: 2_000_000,
      acceptingComments: true,
    },
    ...overrides,
  };
}

function createComment() {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    issueId,
    body: "Observed",
    createdAt: "2026-08-18T20:04:00.000Z",
    createdBy: { id: repositoryId, name: "Ada" },
    submittedVia: { type: "browser" },
    session: null,
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

function createDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    issue: createIssueRecord(overrides),
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
    comments: [],
    commentCapacity: {
      count: 0,
      countLimit: 500,
      serializedBodyBytes: 0,
      serializedBodyBytesLimit: 2_000_000,
      acceptingComments: true,
    },
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
