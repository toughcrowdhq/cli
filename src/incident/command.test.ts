import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "../cli.js";
import type { CredentialStore } from "../auth/credentials.js";
import type { FetchLike } from "../api/request.js";

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteId = "22222222-2222-4222-8222-222222222222";

const incidentNamespaceHelp =
  [
    "Usage: toughcrowd incident [options] [command]",
    "",
    "Work with Tough Crowd incidents",
    "",
    "Options:",
    "  -h, --help                           display help for command",
    "",
    "Commands:",
    "  create [options] <summary>           Create an incident",
    "  list [options]                       List incidents",
    "  get [options] <incident-id>          Show incident detail",
    "  update [options] <incident-id>       Update an incident",
    "  note [options] <incident-id> <body>  Add or edit incident notes",
    "  help [command]                       display help for command",
  ].join("\n") + "\n";

describe("incident commands", () => {
  it("prints literal namespace help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["incident", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(incidentNamespaceHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("routes incident commands to their public API operations", async () => {
    const fetch = createIncidentFetch();
    const invocations: readonly (readonly string[])[] = [
      [
        "incident",
        "create",
        "Checkout is down",
        "--title",
        "Checkout outage",
        "--repo",
        "acme/web",
        "--severity",
        "p1",
        "--json",
      ],
      [
        "incident",
        "list",
        "--state",
        "active",
        "--severity",
        "p1",
        "--repo",
        "acme/web",
        "--limit",
        "25",
        "--cursor",
        "opaque",
        "--json",
      ],
      ["incident", "get", incidentId, "--limit", "10", "--json"],
      [
        "incident",
        "update",
        incidentId,
        "--state",
        "resolved",
        "--resolution-summary",
        "Rolled back",
        "--json",
      ],
      ["incident", "note", incidentId, "Observed", "--json"],
      ["incident", "note", "update", incidentId, noteId, "Edited", "--json"],
    ];

    for (const args of invocations) {
      const runtime = createAuthenticatedRuntime(fetch);
      expect(await runCli(args, runtime)).toBe(0);
      expect(runtime.stderr.output).toBe("");
    }

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "https://api.toughcrowd.dev/api/incidents"],
      [
        "GET",
        "https://api.toughcrowd.dev/api/incidents?state=active&severity=p1&repositoryFullName=acme%2Fweb&limit=25&cursor=opaque",
      ],
      ["GET", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      [
        "GET",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes?limit=10`,
      ],
      ["PATCH", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      ["POST", `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes`],
      [
        "PATCH",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes/${noteId}`,
      ],
    ]);
    expect(fetch.calls[0]).toMatchObject({
      body: {
        summary: "Checkout is down",
        title: "Checkout outage",
        repositoryFullName: "acme/web",
        severity: "p1",
      },
      idempotencyKey: undefined,
    });
    expect(fetch.calls[4].body).toEqual({
      state: "resolved",
      resolutionSummary: "Rolled back",
    });
    expect(fetch.calls[5].idempotencyKey).toBeUndefined();
  });

  it("infers repository only for create", async () => {
    const fetch = createIncidentFetch();
    const createRuntime = {
      ...createAuthenticatedRuntime(fetch),
      env: { TOUGHCROWD_API_KEY: "tc_secret", TOUGHCROWD_REPO: "Env/Repo" },
      readGitOrigin: () => Promise.resolve("git@github.com:origin/repo.git"),
    };
    const listRuntime = {
      ...createAuthenticatedRuntime(fetch),
      env: { TOUGHCROWD_API_KEY: "tc_secret", TOUGHCROWD_REPO: "Env/Repo" },
      readGitOrigin() {
        throw new Error("list must not infer repository");
      },
    };
    const updateRuntime = {
      ...createAuthenticatedRuntime(fetch),
      env: { TOUGHCROWD_API_KEY: "tc_secret", TOUGHCROWD_REPO: "Env/Repo" },
      readGitOrigin() {
        throw new Error("update must not infer repository");
      },
    };

    expect(
      await runCli(
        [
          "incident",
          "create",
          "Checkout is down",
          "--title",
          "Outage",
          "--json",
        ],
        createRuntime,
      ),
    ).toBe(0);
    expect(await runCli(["incident", "list", "--json"], listRuntime)).toBe(0);
    expect(
      await runCli(
        ["incident", "update", incidentId, "--title", "Updated", "--json"],
        updateRuntime,
      ),
    ).toBe(0);

    expect(fetch.calls[0].body).toMatchObject({
      repositoryFullName: "env/repo",
    });
    expect(fetch.calls[1].url).toBe("https://api.toughcrowd.dev/api/incidents");
    expect(fetch.calls[2].body).toEqual({ title: "Updated" });
  });

  it("prints JSON for nested note updates", async () => {
    const fetch = createIncidentFetch();
    const runtime = createAuthenticatedRuntime(fetch);

    expect(
      await runCli(
        ["incident", "note", "update", incidentId, noteId, "Edited", "--json"],
        runtime,
      ),
    ).toBe(0);

    expect(JSON.parse(runtime.stdout.output)).toEqual({
      note: createNote({ body: "Edited" }),
    });
    expect(runtime.stderr.output).toBe("");
  });

  it("rejects invalid choices, pagination, and no-op updates before fetching", async () => {
    const fetch = createIncidentFetch();
    const invalidInvocations = [
      [
        "incident",
        "create",
        "Summary",
        "--title",
        "Title",
        "--severity",
        "sev1",
      ],
      ["incident", "list", "--limit", "101"],
      ["incident", "get", incidentId, "--cursor", "x".repeat(513)],
      ["incident", "update", incidentId],
      ["incident", "update", incidentId, "--issue-version", "1"],
      ["incident", "list", "--flag-cache"],
      ["incident", "note", incidentId, " "],
      ["incident", "resolve", incidentId],
      ["incident", "retry", incidentId],
      ["incident", "attach-session", incidentId],
      ["incident", "relationship", incidentId],
      ["incident", "memory", incidentId],
      ["incident", "poll", incidentId],
    ];

    for (const args of invalidInvocations) {
      const runtime = createAuthenticatedRuntime(fetch);
      expect(await runCli(args, runtime)).not.toBe(0);
    }
    expect(fetch.calls).toEqual([]);
  });

  it("surfaces disabled incidents through the server not-found response", async () => {
    const runtime = createAuthenticatedRuntime(
      createStaticFetch(
        {
          error: {
            code: "not-found",
            message: "Incident Repository is not enabled.",
          },
        },
        404,
      ),
    );

    const exitCode = await runCli(["incident", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not list incidents: Incident Repository is not enabled.\n",
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
    version: "0.7.0-test",
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
    createIdempotencyKey() {
      throw new Error("incidents must not create idempotency keys");
    },
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

function createIncidentFetch(): FetchLike & { calls: FetchCall[] } {
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
  if (call.url.endsWith(`/notes/${noteId}`)) {
    return { note: createNote({ body: "Edited" }) };
  }
  if (call.url.endsWith("/notes")) return { note: createNote() };
  if (call.url.includes("/notes?")) {
    return { notes: [createNote()], nextCursor: null };
  }
  if (call.url.includes("/api/incidents?") || call.url.endsWith("/incidents")) {
    return call.method === "GET"
      ? { incidents: [createIncident()], nextCursor: null }
      : { incident: createIncident() };
  }
  return { incident: createIncident() };
}

function createIncident() {
  return {
    id: incidentId,
    repositoryFullName: "acme/web",
    createdByUserId: "33333333-3333-4333-8333-333333333333",
    updatedByUserId: null,
    title: "Checkout outage",
    summary: "Checkout is down",
    severity: "p1",
    state: "active",
    resolutionSummary: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    resolvedAt: null,
  };
}

function createNote(overrides: Record<string, unknown> = {}) {
  return {
    id: noteId,
    incidentId,
    body: "Observed",
    createdAt: "2026-08-18T20:03:02.000Z",
    updatedAt: "2026-08-18T20:03:02.000Z",
    createdBy: null,
    updatedBy: { id: "33333333-3333-4333-8333-333333333333", name: "Ada" },
    ...overrides,
  };
}
