import { describe, expect, it } from "vitest";
import type { CredentialStore } from "../auth/credentials.js";
import { runCli, type CliRuntime } from "../cli.js";

const sessionNewHelp =
  [
    "Usage: toughcrowd session new [options] <prompt>",
    "",
    "Create a new coding-agent session",
    "",
    "Arguments:",
    "  prompt                  initial instruction for the coding agent",
    "",
    "Options:",
    "  --repo <owner/name>     repository for the session",
    "  --profile <profile-id>  Agent Profile to use",
    "  --base-branch <branch>  base branch for generated changes",
    "  --title <title>         session title",
    "  --json                  print machine-readable JSON",
    "  -h, --help              display help for command",
  ].join("\n") + "\n";

describe("session new command", () => {
  it("prints literal help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["session", "new", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(sessionNewHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("creates a session with literal flags and one idempotency key", async () => {
    let idempotencyKeyCalls = 0;
    const fetch = createFetch(() =>
      jsonResponse(createSessionResponse({ title: "Fix checkout" }), 201),
    );
    const runtime = createRuntime({
      env: {
        TOUGHCROWD_API_KEY: "tc_env_secret",
        TOUGHCROWD_REPO: "ignored/repo",
        TOUGHCROWD_AGENT_PROFILE: "ignored-profile",
      },
      fetch,
      readGitOrigin() {
        throw new Error("Git origin must not be read when --repo is set");
      },
      createIdempotencyKey() {
        idempotencyKeyCalls += 1;
        return "idem_create_123";
      },
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "  Fix the flaky checkout test  ",
        "--repo",
        "Acme/Web",
        "--profile",
        "codex-cli-default",
        "--base-branch",
        " feature/base ",
        "--title",
        " Fix checkout ",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(idempotencyKeyCalls).toBe(1);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toMatchObject({
      url: "https://api.toughcrowd.dev/api/sessions",
      method: "POST",
      authorization: "Bearer tc_env_secret",
      idempotencyKey: "idem_create_123",
      contentType: "application/json",
      client: "@toughcrowd/cli/0.2.0-test",
      body: JSON.stringify({
        prompt: "Fix the flaky checkout test",
        repository: "acme/web",
        agentProfile: "codex-cli-default",
        baseBranch: "feature/base",
        title: "Fix checkout",
      }),
    });
    expect(fetch.calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(runtime.stdout.output).toBe(
      "Session created\n" +
        "ID: 33333333-3333-4333-8333-333333333333\n" +
        "Status: queued\n" +
        "Repository: acme/web\n" +
        "Agent Profile: Codex CLI (codex-cli-default)\n" +
        "Title: Fix checkout\n",
    );
    expect(runtime.stderr.output).toBe("");
  });

  it("resolves repository from GitHub origin and profile from environment", async () => {
    let originReads = 0;
    const fetch = createFetch(() =>
      jsonResponse(createSessionResponse({ title: null }), 201),
    );
    const runtime = createRuntime({
      env: {
        TOUGHCROWD_API_KEY: "tc_secret",
        TOUGHCROWD_AGENT_PROFILE: "codex-cli-default",
      },
      fetch,
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:ToughCrowdHQ/CLI.git");
      },
    });

    const exitCode = await runCli(
      ["session", "new", "Fix checkout", "--json"],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(originReads).toBe(1);
    expect(fetch.calls[0].body).toBe(
      JSON.stringify({
        prompt: "Fix checkout",
        repository: "toughcrowdhq/cli",
        agentProfile: "codex-cli-default",
      }),
    );
    expect(runtime.stdout.output).toBe(
      '{"session":{"id":"33333333-3333-4333-8333-333333333333","status":"queued","repository":{"fullName":"acme/web"},"agentProfile":{"id":"codex-cli-default","name":"Codex CLI"},"title":null}}\n',
    );
    expect(runtime.stdout.output).not.toContain("initialPrompt");
    expect(runtime.stdout.output).not.toContain("serverOnly");
    expect(runtime.stderr.output).toBe("");
  });

  it("delegates Agent Profile selection to the server when no override is set", async () => {
    const fetch = createFetch(() =>
      jsonResponse(createSessionResponse({ title: null }), 201),
    );
    const runtime = createRuntime({
      env: {
        TOUGHCROWD_API_KEY: "tc_secret",
      },
      fetch,
    });

    const exitCode = await runCli(
      ["session", "new", "Fix checkout", "--repo", "acme/web", "--json"],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(fetch.calls[0].body).toBe(
      JSON.stringify({
        prompt: "Fix checkout",
        repository: "acme/web",
      }),
    );
    expect(runtime.stderr.output).toBe("");
  });

  it("prints generating for an omitted title", async () => {
    const runtime = createAuthenticatedRuntime(
      createSessionResponse({ title: null }),
    );

    const exitCode = await runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toContain("Title: (generating)\n");
  });

  it("rejects missing and empty prompts as usage errors", async () => {
    const missingPrompt = createRuntime();
    const emptyPrompt = createRuntime();

    const missingExitCode = await runCli(["session", "new"], missingPrompt);
    const emptyExitCode = await runCli(
      [
        "session",
        "new",
        "   ",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      emptyPrompt,
    );

    expect(missingExitCode).toBe(2);
    expect(missingPrompt.stdout.output).toBe("");
    expect(missingPrompt.stderr.output).toBe(
      "error: missing required argument 'prompt'\n",
    );
    expect(emptyExitCode).toBe(2);
    expect(emptyPrompt.stderr.output).toBe("Prompt must not be empty.\n");
  });

  it("fails with actionable missing-context guidance before authentication", async () => {
    let credentialReads = 0;
    const runtime = createRuntime({
      env: { TOUGHCROWD_AGENT_PROFILE: "codex-cli-default" },
      credentialStore: {
        read() {
          credentialReads += 1;
          return Promise.resolve(null);
        },
        write() {
          return Promise.resolve();
        },
      },
      readGitOrigin() {
        return Promise.resolve("git@gitlab.com:acme/web.git");
      },
    });

    const exitCode = await runCli(["session", "new", "Fix checkout"], runtime);

    expect(exitCode).toBe(1);
    expect(credentialReads).toBe(0);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Repository is required. Use --repo <owner/name>, set TOUGHCROWD_REPO, or run the command in a GitHub checkout with an origin remote.\n",
    );
  });

  it("fails before idempotency generation when authentication is missing", async () => {
    let idempotencyKeyCalls = 0;
    const runtime = createRuntime({
      createIdempotencyKey() {
        idempotencyKeyCalls += 1;
        return "unused";
      },
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );

    expect(exitCode).toBe(1);
    expect(idempotencyKeyCalls).toBe(0);
    expect(runtime.stderr.output).toBe(
      "Not authenticated for https://api.toughcrowd.dev. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.\n",
    );
  });

  it.each([
    [
      "an unavailable repository",
      apiError("not-found", "Repository is not available.", 404),
      "Could not create session: repository is not available. Check --repo and your GitHub connection.\n",
    ],
    [
      "an invalid profile",
      apiError("validation-failed", "Agent Profile is not available.", 422),
      "Could not create session: Agent Profile is not available.\n",
    ],
    [
      "an idempotency conflict",
      apiError(
        "conflict",
        "Idempotency-Key was already used for different input.",
        409,
      ),
      "Could not create session: Idempotency-Key was already used for different input.\n",
    ],
  ])("reports %s", async (_description, response, expectedError) => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch: createFetch(() => response),
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "unknown-profile",
      ],
      runtime,
    );

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(expectedError);
  });

  it("does not expose structured API 5xx messages", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch: createFetch(() =>
        apiError(
          "internal-error",
          "Database connection failed for production-primary.",
          500,
        ),
      ),
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not create session: the Tough Crowd API returned an internal error.\n",
    );
    expect(runtime.stderr.output).not.toContain("production-primary");
  });

  it("rejects malformed responses without exposing server fields", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_secret" },
      fetch: createFetch(() =>
        jsonResponse({
          session: {
            id: "not-a-uuid",
            authorization: "Bearer server-secret",
          },
          debug: "server-secret",
        }),
      ),
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not create session: the Tough Crowd API returned an invalid response.\n",
    );
    expect(runtime.stderr.output).not.toContain("server-secret");
    expect(runtime.stderr.output).not.toContain("Bearer");
  });

  it("does not expose secrets from structured API errors", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_create_secret" },
      fetch: createFetch(() =>
        jsonResponse(
          {
            error: {
              code: "conflict",
              message: "A matching request is still processing.",
              requestId: "req_processing",
            },
            debug: {
              apiKey: "tc_create_secret",
              prompt: "private prompt",
            },
          },
          409,
        ),
      ),
    });

    const exitCode = await runCli(
      [
        "session",
        "new",
        "private prompt",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );

    expect(exitCode).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Could not create session: A matching request is still processing.\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_create_secret");
    expect(runtime.stderr.output).not.toContain("private prompt");
  });

  it("cancels the creation request with the interrupt exit code", async () => {
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
            reject(new Error("sensitive canceled creation detail"));
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

    const running = runCli(
      [
        "session",
        "new",
        "Fix checkout",
        "--repo",
        "acme/web",
        "--profile",
        "codex-cli-default",
      ],
      runtime,
    );
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
    fetch: createFetch(() => jsonResponse(response, 201)),
  });
}

function createSessionResponse(options: { title: string | null }) {
  return {
    session: {
      id: "33333333-3333-4333-8333-333333333333",
      title: options.title,
      status: "queued",
      repository: {
        fullName: "acme/web",
        serverOnly: "discarded",
      },
      agentProfile: {
        id: "codex-cli-default",
        name: "Codex CLI",
        model: "server-only",
      },
      initialPrompt: "server-only",
      events: [],
    },
  };
}

function apiError(code: string, message: string, status: number): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        requestId: "req_create_error",
      },
    },
    status,
  );
}

interface CapturedWritable {
  output: string;
  write(value: string): void;
}

function createRuntime(
  overrides: Partial<
    Pick<
      CliRuntime,
      | "version"
      | "signal"
      | "env"
      | "credentialStore"
      | "fetch"
      | "readGitOrigin"
      | "createIdempotencyKey"
    >
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
    readGitOrigin: overrides.readGitOrigin ?? (() => Promise.resolve(null)),
    createIdempotencyKey:
      overrides.createIdempotencyKey ?? (() => "idem_default"),
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
): CredentialStore {
  return {
    read(apiOrigin) {
      return Promise.resolve(values[apiOrigin] ?? null);
    },
    write() {
      return Promise.resolve();
    },
  };
}

interface TestFetchCall {
  url: string;
  method: string | undefined;
  authorization: string | null;
  idempotencyKey: string | null;
  contentType: string | null;
  client: string | null;
  body: BodyInit | null | undefined;
  signal: AbortSignal | null | undefined;
}

interface TestFetch {
  (input: URL, init: RequestInit): Promise<Response>;
  calls: TestFetchCall[];
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
      idempotencyKey: headers.get("idempotency-key"),
      contentType: headers.get("content-type"),
      client: headers.get("x-toughcrowd-client"),
      body: init.body,
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
