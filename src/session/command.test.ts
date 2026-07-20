import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "../cli.js";
import type { CredentialStore } from "../auth/credentials.js";

const sessionNamespaceHelp =
  [
    "Usage: toughcrowd session [options] [command]",
    "",
    "Work with Tough Crowd sessions",
    "",
    "Options:",
    "  -h, --help              display help for command",
    "",
    "Commands:",
    "  list [options]          List sessions visible to the authenticated user",
    "  new [options] <prompt>  Create a new coding-agent session",
    "  help [command]          display help for command",
  ].join("\n") + "\n";

const sessionListHelp =
  [
    "Usage: toughcrowd session list [options]",
    "",
    "List sessions visible to the authenticated user",
    "",
    "Options:",
    '  --status <status>    filter by session status (choices: "all", "queued",',
    '                       "initializing", "running", "ready", "failed",',
    '                       "cancelled", "merged", "abandoned", "archived")',
    "  --repo <owner/name>  filter by repository",
    "  --limit <count>      maximum sessions to return",
    "  --cursor <cursor>    continue from an opaque page cursor",
    "  --json               print machine-readable JSON",
    "  -h, --help           display help for command",
  ].join("\n") + "\n";

describe("session list command", () => {
  it("prints literal namespace help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["session", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(sessionNamespaceHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("prints literal list help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["session", "list", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(sessionListHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("lists one bounded human-readable page with a stored credential", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.dev": "tc_stored_secret",
    });
    const fetch = createFetch(() => jsonResponse(createSessionListResponse()));
    const runtime = createRuntime({ credentialStore: store, fetch });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      "ID                                    STATUS        REPOSITORY                    TITLE                                             CREATED                 \n" +
        "11111111-1111-4111-8111-111111111111  running       acme/web                      Fix the flaky checkout test                       2026-07-18T20:01:02.000Z\n" +
        "22222222-2222-4222-8222-222222222222  ready         (unavailable)                 (untitled)                                        2026-07-17T10:20:30.000Z\n" +
        'Next page: toughcrowd session list --cursor "opaque.cursor/value+=?"\n',
    );
    expect(runtime.stderr.output).toBe("");
    expect(store.reads).toEqual(["https://api.toughcrowd.dev"]);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toMatchObject({
      url: "https://api.toughcrowd.dev/api/sessions",
      method: "GET",
      authorization: "Bearer tc_stored_secret",
      client: "@toughcrowd/cli/0.2.0-test",
    });
    expect(fetch.calls[0].signal?.aborted).toBe(false);
  });

  it("encodes filters, limit, and the opaque cursor without changing origins", async () => {
    const fetch = createFetch(() =>
      jsonResponse(createSessionListResponse({ terminalPage: true })),
    );
    const runtime = createRuntime({
      env: {
        TOUGHCROWD_API_ORIGIN: "http://localhost:3001",
        TOUGHCROWD_API_KEY: "tc_env_secret",
      },
      credentialStore: {
        read() {
          throw new Error("stored credential must not be read");
        },
        write() {
          throw new Error("stored credential must not be written");
        },
      },
      fetch,
    });

    const exitCode = await runCli(
      [
        "session",
        "list",
        "--status",
        "cancelled",
        "--repo",
        "acme/web app",
        "--limit",
        "50",
        "--cursor",
        "cursor /+=?",
        "--json",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(fetch.calls[0].url).toBe(
      "http://localhost:3001/api/sessions?status=cancelled&repository=acme%2Fweb+app&limit=50&cursor=cursor+%2F%2B%3D%3F",
    );
    expect(fetch.calls[0].authorization).toBe("Bearer tc_env_secret");
    expect(runtime.stderr.output).toBe("");
  });

  it("prints one stable JSON document without server-only fields", async () => {
    const runtime = createAuthenticatedRuntime(
      createSessionListResponse({ terminalPage: true }),
    );

    const exitCode = await runCli(["session", "list", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      '{"sessions":[{"id":"11111111-1111-4111-8111-111111111111","title":"Fix the flaky checkout test","status":"running","repository":{"fullName":"acme/web"},"createdAt":"2026-07-18T20:01:02.000Z"},{"id":"22222222-2222-4222-8222-222222222222","title":null,"status":"ready","repository":null,"createdAt":"2026-07-17T10:20:30.000Z"}],"counts":{"all":2,"queued":0,"initializing":0,"running":1,"ready":1,"failed":0,"cancelled":0,"merged":0,"abandoned":0,"archived":0},"pageInfo":{"nextCursor":null,"hasMore":false}}\n',
    );
    expect(runtime.stdout.output).not.toContain("initialPrompt");
    expect(runtime.stderr.output).toBe("");
  });

  it("reports an empty page explicitly", async () => {
    const runtime = createAuthenticatedRuntime({
      sessions: [],
      counts: createCounts(),
      pageInfo: { nextCursor: null, hasMore: false },
    });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe("No sessions found.\n");
    expect(runtime.stderr.output).toBe("");
  });

  it("rejects invalid filters and limits as usage errors", async () => {
    const invalidStatus = createRuntime();
    const invalidLimit = createRuntime();

    const statusExitCode = await runCli(
      ["session", "list", "--status", "cancelling"],
      invalidStatus,
    );
    const limitExitCode = await runCli(
      ["session", "list", "--limit", "101"],
      invalidLimit,
    );

    expect(statusExitCode).toBe(2);
    expect(invalidStatus.stderr.output).toBe(
      "error: option '--status <status>' argument 'cancelling' is invalid. Allowed choices are all, queued, initializing, running, ready, failed, cancelled, merged, abandoned, archived.\n",
    );
    expect(limitExitCode).toBe(2);
    expect(invalidLimit.stderr.output).toBe(
      "error: option '--limit <count>' argument '101' is invalid. must be an integer from 1 to 100\n",
    );
  });

  it("fails before a request when no credential is available", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Not authenticated for https://api.toughcrowd.dev. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.\n",
    );
  });

  it("reports revoked credentials without exposing response internals", async () => {
    const fetch = createFetch(() =>
      jsonResponse(
        {
          error: {
            code: "authentication-required",
            message: "The API key has been revoked.",
            requestId: "req_revoked",
          },
          debug: {
            apiKey: "tc_revoked_secret",
            authorization: "Bearer tc_revoked_secret",
          },
        },
        401,
      ),
    );
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_revoked_secret" },
      fetch,
    });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Authentication failed: The API key has been revoked. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_revoked_secret");
    expect(runtime.stderr.output).not.toContain("Bearer");
  });

  it("prints bounded API failures and ordinary failure exit codes", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch: createFetch(() =>
        jsonResponse(
          {
            error: {
              code: "rate-limited",
              message: "Too many session list requests.",
              requestId: "req_rate_limited",
            },
          },
          429,
        ),
      ),
    });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not list sessions: Too many session list requests.\n",
    );
  });

  it("does not expose structured API 5xx messages", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch: createFetch(() =>
        jsonResponse(
          {
            error: {
              code: "internal-error",
              message: "Database connection failed for production-primary.",
              requestId: "req_internal_error",
            },
          },
          500,
        ),
      ),
    });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not list sessions: the Tough Crowd API returned an internal error.\n",
    );
    expect(runtime.stderr.output).not.toContain("production-primary");
  });

  it("rejects malformed success responses", async () => {
    const runtime = createAuthenticatedRuntime({
      sessions: [{ id: "not-a-uuid" }],
      counts: createCounts(),
      pageInfo: { nextCursor: null, hasMore: false },
    });

    const exitCode = await runCli(["session", "list"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not list sessions: the Tough Crowd API returned an invalid response.\n",
    );
  });

  it("cancels the in-flight request and returns the interrupt exit code", async () => {
    const abortController = new AbortController();
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetch = createFetch((_url, init) => {
      markFetchStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            reject(new Error("sensitive canceled request detail"));
          },
          { once: true },
        );
      });
    });
    const runtime = createRuntime({
      signal: abortController.signal,
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch,
    });

    const running = runCli(["session", "list"], runtime);
    await fetchStarted;
    abortController.abort();
    const exitCode = await running;

    expect(exitCode).toBe(130);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe("");
  });
});

function createAuthenticatedRuntime(response: unknown) {
  return createRuntime({
    env: { TOUGHCROWD_API_KEY: "tc_secret" },
    fetch: createFetch(() => jsonResponse(response)),
  });
}

function createSessionListResponse(options: { terminalPage?: boolean } = {}) {
  return {
    sessions: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Fix the flaky checkout test",
        status: "running",
        repository: {
          fullName: "acme/web",
          serverOnly: "discarded",
        },
        createdAt: "2026-07-18T20:01:02.000Z",
        initialPrompt: "Do not expose this field",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: null,
        status: "ready",
        repository: null,
        createdAt: "2026-07-17T10:20:30.000Z",
      },
    ],
    counts: createCounts({ all: 2, running: 1, ready: 1 }),
    pageInfo:
      options.terminalPage === true
        ? { nextCursor: null, hasMore: false }
        : { nextCursor: "opaque.cursor/value+=?", hasMore: true },
  };
}

function createCounts(overrides: Record<string, number> = {}) {
  return {
    all: 0,
    queued: 0,
    initializing: 0,
    running: 0,
    ready: 0,
    failed: 0,
    cancelled: 0,
    merged: 0,
    abandoned: 0,
    archived: 0,
    ...overrides,
  };
}

interface CapturedWritable {
  output: string;
  write(value: string): void;
}

function createRuntime(
  overrides: Partial<
    Pick<CliRuntime, "version" | "signal" | "env" | "credentialStore" | "fetch">
  > = {},
): CliRuntime & { stdout: CapturedWritable; stderr: CapturedWritable } {
  return {
    stdout: createWritable(),
    stderr: createWritable(),
    version: overrides.version ?? "0.2.0-test",
    signal: overrides.signal ?? new AbortController().signal,
    env: overrides.env,
    credentialStore:
      overrides.credentialStore ?? createMemoryCredentialStore({}),
    fetch: overrides.fetch,
  };
}

function createWritable(): CapturedWritable {
  return {
    output: "",
    write(value) {
      this.output += value;
    },
  };
}

function createMemoryCredentialStore(
  values: Record<string, string>,
): CredentialStore & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read(apiOrigin) {
      reads.push(apiOrigin);
      return Promise.resolve(values[apiOrigin] ?? null);
    },
    write() {
      return Promise.resolve();
    },
  };
}

interface TestFetch {
  (input: URL, init: RequestInit): Promise<Response>;
  calls: Array<{
    url: string;
    method: string | undefined;
    authorization: string | null;
    client: string | null;
    signal: AbortSignal | null | undefined;
  }>;
}

function createFetch(
  responder: (url: URL, init: RequestInit) => Response | Promise<Response>,
): TestFetch {
  const fetch = (async (url: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    fetch.calls.push({
      url: url.toString(),
      method: init.method,
      authorization: headers.get("authorization"),
      client: headers.get("x-toughcrowd-client"),
      signal: init.signal,
    });
    return await responder(url, init);
  }) as TestFetch;
  fetch.calls = [];
  return fetch;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
