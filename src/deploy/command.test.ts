import { describe, expect, it } from "vitest";
import type { CredentialStore } from "../auth/credentials.js";
import { runCli, type CliRuntime } from "../cli.js";

const commitSha = "0123456789abcdef0123456789abcdef01234567";

const deployNamespaceHelp =
  [
    "Usage: toughcrowd deploy [options] [command]",
    "",
    "Record Tough Crowd deployments",
    "",
    "Options:",
    "  -h, --help        display help for command",
    "",
    "Commands:",
    "  record [options]  Record a production deployment from GitHub Actions",
    "  help [command]    display help for command",
  ].join("\n") + "\n";

const deployRecordHelp =
  [
    "Usage: toughcrowd deploy record [options]",
    "",
    "Record a production deployment from GitHub Actions",
    "",
    "Options:",
    "  --json      print machine-readable JSON",
    "  -h, --help  display help for command",
  ].join("\n") + "\n";

describe("deploy record command", () => {
  it("prints literal namespace and command help", async () => {
    const namespace = createRuntime();
    const record = createRuntime();

    const namespaceExitCode = await runCli(["deploy", "--help"], namespace);
    const recordExitCode = await runCli(["deploy", "record", "--help"], record);

    expect(namespaceExitCode).toBe(0);
    expect(namespace.stdout.output).toBe(deployNamespaceHelp);
    expect(namespace.stderr.output).toBe("");
    expect(recordExitCode).toBe(0);
    expect(record.stdout.output).toBe(deployRecordHelp);
    expect(record.stderr.output).toBe("");
  });

  it("records a production deployment from GitHub Actions context", async () => {
    const fetch = createFetch(() =>
      jsonResponse(createDeploymentResponse({ newlyDeployedSessions: 2 }), 201),
    );
    const runtime = createRuntime({
      env: githubActionsEnv({ TOUGHCROWD_API_KEY: "tc_deploy_secret" }),
      fetch,
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(0);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toMatchObject({
      url: "https://api.toughcrowd.dev/api/deployments",
      method: "POST",
      authorization: "Bearer tc_deploy_secret",
      idempotencyKey:
        "github-actions:acme/web:0123456789abcdef0123456789abcdef01234567:987654321:3",
      contentType: "application/json",
      client: "@toughcrowd/cli/0.2.0-test",
      body: JSON.stringify({
        repository: "acme/web",
        commitSha,
        environment: "production",
        source: {
          provider: "github_actions",
          runId: "987654321",
          runAttempt: "3",
          workflowRunUrl: "https://github.com/acme/web/actions/runs/987654321",
        },
      }),
    });
    expect(runtime.stdout.output).toBe(
      "Deployment recorded\n" +
        "Repository: acme/web\n" +
        `SHA: ${commitSha}\n` +
        "Sessions newly marked Deployed: 2\n",
    );
    expect(runtime.stderr.output).toBe("");
  });

  it("prints the decoded response as JSON without server-only fields", async () => {
    const runtime = createRuntime({
      env: githubActionsEnv({ TOUGHCROWD_API_KEY: "tc_deploy_secret" }),
      fetch: createFetch(() =>
        jsonResponse({
          ...createDeploymentResponse({ newlyDeployedSessions: 0 }),
          serverOnly: "discarded",
        }),
      ),
    });

    const exitCode = await runCli(["deploy", "record", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      `{"deployment":{"id":"44444444-4444-4444-8444-444444444444","repository":{"fullName":"acme/web"},"commitSha":"${commitSha}","environment":"production","newlyDeployedSessions":0}}\n`,
    );
    expect(runtime.stdout.output).not.toContain("serverOnly");
    expect(runtime.stderr.output).toBe("");
  });

  it("normalizes repository and SHA while preserving run identity", async () => {
    const fetch = createFetch(() =>
      jsonResponse(createDeploymentResponse({ newlyDeployedSessions: 1 }), 201),
    );
    const runtime = createRuntime({
      env: githubActionsEnv({
        TOUGHCROWD_API_KEY: "tc_deploy_secret",
        GITHUB_REPOSITORY: "Acme/Web",
        GITHUB_SHA: commitSha.toUpperCase(),
        GITHUB_SERVER_URL: "https://github.example.com",
      }),
      fetch,
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(0);
    expect(fetch.calls[0].idempotencyKey).toBe(
      "github-actions:acme/web:0123456789abcdef0123456789abcdef01234567:987654321:3",
    );
    expect(fetch.calls[0].body).toContain(
      '"workflowRunUrl":"https://github.example.com/acme/web/actions/runs/987654321"',
    );
  });

  it("fails with concise context errors before authentication", async () => {
    let credentialReads = 0;
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_deploy_secret" },
      credentialStore: {
        read() {
          credentialReads += 1;
          return Promise.resolve(null);
        },
        write() {
          return Promise.resolve();
        },
      },
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(1);
    expect(credentialReads).toBe(0);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not record deployment: GITHUB_REPOSITORY is required. Run `toughcrowd deploy record` from a GitHub Actions workflow after deployment health checks succeed.\n",
    );
  });

  it.each([
    [
      "short SHA",
      { GITHUB_SHA: "abc123" },
      "Could not record deployment: GITHUB_SHA must be the full 40-character commit SHA.\n",
    ],
    [
      "missing run ID",
      { GITHUB_RUN_ID: "" },
      "Could not record deployment: GITHUB_RUN_ID is required. Run `toughcrowd deploy record` from a GitHub Actions workflow after deployment health checks succeed.\n",
    ],
    [
      "bad run attempt",
      { GITHUB_RUN_ATTEMPT: "0" },
      "Could not record deployment: GITHUB_RUN_ATTEMPT must be a positive GitHub Actions run attempt.\n",
    ],
    [
      "non-HTTPS server URL",
      { GITHUB_SERVER_URL: "http://github.example.com" },
      "Could not record deployment: GITHUB_SERVER_URL must be an HTTPS URL.\n",
    ],
  ])("rejects %s", async (_label, envOverride, expectedError) => {
    const fetch = createFetch(() =>
      jsonResponse(createDeploymentResponse({ newlyDeployedSessions: 1 })),
    );
    const runtime = createRuntime({
      env: githubActionsEnv({
        TOUGHCROWD_API_KEY: "tc_deploy_secret",
        ...envOverride,
      }),
      fetch,
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(1);
    expect(fetch.calls).toEqual([]);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(expectedError);
  });

  it("reports structured API errors without exposing secrets", async () => {
    const runtime = createRuntime({
      env: githubActionsEnv({ TOUGHCROWD_API_KEY: "tc_deploy_secret" }),
      fetch: createFetch(() =>
        jsonResponse(
          {
            error: {
              code: "conflict",
              message: "Deployment source identity was already used.",
              requestId: "req_deploy_conflict",
            },
            debug: { authorization: "Bearer tc_deploy_secret" },
          },
          409,
        ),
      ),
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not record deployment: Deployment source identity was already used.\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_deploy_secret");
    expect(runtime.stderr.output).not.toContain("Bearer");
  });

  it("does not expose structured API 5xx messages", async () => {
    const runtime = createRuntime({
      env: githubActionsEnv({ TOUGHCROWD_API_KEY: "tc_deploy_secret" }),
      fetch: createFetch(() =>
        jsonResponse(
          {
            error: {
              code: "internal-error",
              message: "Queue failure in production-primary.",
            },
          },
          500,
        ),
      ),
    });

    const exitCode = await runCli(["deploy", "record"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Could not record deployment: the Tough Crowd API returned an internal error.\n",
    );
    expect(runtime.stderr.output).not.toContain("production-primary");
  });
});

function githubActionsEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY: "acme/web",
    GITHUB_SHA: commitSha,
    GITHUB_RUN_ID: "987654321",
    GITHUB_RUN_ATTEMPT: "3",
    GITHUB_SERVER_URL: "https://github.com",
    ...overrides,
  };
}

function createDeploymentResponse(options: { newlyDeployedSessions: number }) {
  return {
    deployment: {
      id: "44444444-4444-4444-8444-444444444444",
      repository: {
        fullName: "acme/web",
        serverOnly: "discarded",
      },
      commitSha,
      environment: "production",
      newlyDeployedSessions: options.newlyDeployedSessions,
    },
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
