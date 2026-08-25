import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/request.js";
import type { CredentialStore } from "../auth/credentials.js";
import { runCli, type CliRuntime } from "../cli.js";

const sessionId = "11111111-1111-4111-8111-111111111111";

const cancelHelp =
  [
    "Usage: toughcrowd session cancel [options] <session-id>",
    "",
    "Cancel an active session",
    "",
    "Arguments:",
    "  session-id  session ID",
    "",
    "Options:",
    "  --json      print machine-readable JSON",
    "  -h, --help  display help for command",
  ].join("\n") + "\n";

const abandonHelp =
  [
    "Usage: toughcrowd session abandon [options] <session-id>",
    "",
    "Abandon an unshipped session",
    "",
    "Arguments:",
    "  session-id  session ID",
    "",
    "Options:",
    "  --json      print machine-readable JSON",
    "  -h, --help  display help for command",
  ].join("\n") + "\n";

describe("session end commands", () => {
  it("prints literal command help", async () => {
    const cancelRuntime = createRuntime();
    const abandonRuntime = createRuntime();

    expect(await runCli(["session", "cancel", "--help"], cancelRuntime)).toBe(
      0,
    );
    expect(await runCli(["session", "abandon", "--help"], abandonRuntime)).toBe(
      0,
    );

    expect(cancelRuntime.stdout.output).toBe(cancelHelp);
    expect(cancelRuntime.stderr.output).toBe("");
    expect(abandonRuntime.stdout.output).toBe(abandonHelp);
    expect(abandonRuntime.stderr.output).toBe("");
  });

  it("cancels an active session and prints a bounded human result", async () => {
    const fetch = createFetch(() =>
      jsonResponse({
        session: {
          id: sessionId,
          status: "cancelling",
          initialPrompt: "server-only",
        },
      }),
    );
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(["session", "cancel", sessionId], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      `Session cancellation requested\nID: ${sessionId}\nStatus: cancelling\n`,
    );
    expect(runtime.stderr.output).toBe("");
    expect(fetch.calls).toEqual([
      {
        url: `https://api.toughcrowd.dev/api/sessions/${sessionId}/cancel`,
        method: "POST",
        authorization: "Bearer tc_secret",
        client: "@toughcrowd/cli/0.4.0-test",
        body: undefined,
      },
    ]);
  });

  it("abandons a review-ready session and prints projected JSON", async () => {
    const fetch = createFetch(() =>
      jsonResponse({
        session: {
          id: sessionId,
          status: "abandoned",
          repository: { fullName: "acme/web" },
        },
      }),
    );
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(
      ["session", "abandon", sessionId, "--json"],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      `{"session":{"id":"${sessionId}","status":"abandoned"}}\n`,
    );
    expect(runtime.stderr.output).toBe("");
    expect(fetch.calls[0]?.url).toBe(
      `https://api.toughcrowd.dev/api/sessions/${sessionId}/abandon`,
    );
  });

  it("rejects a non-UUID session ID before authentication or a request", async () => {
    const fetch = createFetch(() => {
      throw new Error("request must not run");
    });
    const runtime = createRuntime({ fetch });

    const exitCode = await runCli(
      ["session", "cancel", "not-a-session-id"],
      runtime,
    );

    expect(exitCode).toBe(2);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "error: command-argument value 'not-a-session-id' is invalid for argument 'session-id'. must be a UUID\n",
    );
    expect(fetch.calls).toEqual([]);
  });

  it("surfaces lifecycle conflicts without response internals", async () => {
    const fetch = createFetch(() =>
      jsonResponse(
        {
          error: {
            code: "conflict",
            message: "Only review-ready sessions can be abandoned.",
            requestId: "req_conflict",
          },
          debug: { authorization: "Bearer tc_secret" },
        },
        409,
      ),
    );
    const runtime = createAuthenticatedRuntime(fetch);

    const exitCode = await runCli(["session", "abandon", sessionId], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Could not abandon session: Only review-ready sessions can be abandoned.\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_secret");
    expect(runtime.stderr.output).not.toContain("debug");
  });

  it("handles an unfamiliar success status", async () => {
    const runtime = createAuthenticatedRuntime(
      createFetch(() =>
        jsonResponse({ session: { id: sessionId, status: "destroyed" } }),
      ),
    );

    const exitCode = await runCli(["session", "cancel", sessionId], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(
      `Session cancellation requested
ID: ${sessionId}
Status: Unknown status (destroyed)
`,
    );
    expect(runtime.stderr.output).toBe("");
  });
});

interface CapturedWritable {
  output: string;
  write(value: string): void;
}

interface TestFetchCall {
  url: string;
  method: string | undefined;
  authorization: string | null;
  client: string | null;
  body: BodyInit | null | undefined;
}

interface TestFetch extends FetchLike {
  calls: TestFetchCall[];
}

function createAuthenticatedRuntime(fetch: FetchLike) {
  return createRuntime({
    env: { TOUGHCROWD_API_KEY: "tc_secret" },
    fetch,
  });
}

function createRuntime(
  overrides: Partial<
    Pick<CliRuntime, "version" | "signal" | "env" | "credentialStore" | "fetch">
  > = {},
): CliRuntime & { stdout: CapturedWritable; stderr: CapturedWritable } {
  return {
    stdout: createWritable(),
    stderr: createWritable(),
    version: overrides.version ?? "0.4.0-test",
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
