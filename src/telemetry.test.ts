import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, type CliRuntime } from "./cli.js";
import { createTelemetry, safeDiagnostic, safeFrames } from "./telemetry.js";
import { AuthCommandError } from "./auth/errors.js";
import { createKeyringCredentialStore } from "./auth/credentials.js";
import { ApiClientError } from "./api/errors.js";
import type { FetchLike } from "./api/request.js";

const nativeKeyring = vi.hoisted(() => ({
  read: vi.fn<() => string | null>(),
  write: vi.fn<(value: string) => void>(),
}));
vi.mock("@napi-rs/keyring", () => ({
  Entry: class {
    getPassword(): string | null {
      return nativeKeyring.read();
    }
    setPassword(value: string): void {
      nativeKeyring.write(value);
    }
  },
}));

function fixture(env: NodeJS.ProcessEnv = {}) {
  const requests: {
    url: URL;
    init: RequestInit;
    body: Record<string, unknown>;
  }[] = [];
  const telemetryFetch: FetchLike = (url, init) => {
    requests.push({
      url,
      init,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(new Response(null, { status: 202 }));
  };
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  const read = vi.fn((): Promise<string | null> =>
    Promise.reject(new Error("telemetry must not read credentials")),
  );
  const runtime: CliRuntime = {
    env,
    version: "0.8.0",
    stdout,
    stderr,
    signal: new AbortController().signal,
    credentialStore: {
      read,
      write: vi.fn(),
    },
    telemetryFetch,
  };
  const events = () =>
    requests.flatMap(
      (request) => request.body.entries as Record<string, unknown>[],
    );
  return { runtime, requests, events, read, stderr, stdout };
}
afterEach(() => vi.useRealTimers());

describe("CLI telemetry", () => {
  it("emits literal v1 envelopes with deterministic IDs and monotonic duration", async () => {
    const bodies: unknown[] = [];
    let time = 10;
    const ids = [
      "a2417495-daa6-4c57-89fb-dcaec3a32b42",
      "379097f2-bdf2-4ace-b60a-815d94cc0339",
      "379097f2-bdf2-4ace-b60a-815d94cc0340",
    ];
    const reporter = createTelemetry({
      version: "0.8.0",
      env: { CI: "1" },
      now: () => time,
      wallTime: () => new Date("2026-10-30T18:00:00.000Z"),
      uuid: () => ids.shift()!,
      fetch: (_url, init) => {
        bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return Promise.resolve(new Response(null, { status: 202 }));
      },
    })!;
    reporter.start("session list", {});
    time = 852;
    await reporter.finish(0, undefined, false, {});
    const base = {
      schemaVersion: 1,
      invocationId: "a2417495-daa6-4c57-89fb-dcaec3a32b42",
      clientTime: "2026-10-30T18:00:00.000Z",
      cliVersion: "0.8.0",
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      command: "session list",
      executionContext: "ci",
    };
    expect(bodies).toEqual([
      {
        source: "cli-client",
        entries: [
          {
            ...base,
            event: "cli.command.started",
            eventId: "379097f2-bdf2-4ace-b60a-815d94cc0339",
          },
        ],
      },
      {
        source: "cli-client",
        entries: [
          {
            ...base,
            event: "cli.command.finished",
            eventId: "379097f2-bdf2-4ace-b60a-815d94cc0340",
            outcome: "success",
            durationMs: 842,
            exitCode: 0,
          },
        ],
      },
    ]);
    await reporter.finish(1, new Error("ignored"), false, {});
    expect(bodies).toHaveLength(2);
  });

  it("reports anonymous local commands without touching the credential store", async () => {
    const f = fixture({ TOUGHCROWD_API_ORIGIN: "http://localhost:4321" });
    expect(await runCli(["config", "path"], f.runtime)).toBe(0);
    expect(f.events().map((e) => [e.event, e.command, e.outcome])).toEqual([
      ["cli.command.started", "config path", undefined],
      ["cli.command.finished", "config path", "success"],
    ]);
    expect(f.events()[0].invocationId).toBe(f.events()[1].invocationId);
    expect(f.read).not.toHaveBeenCalled();
    for (const { url, init } of f.requests) {
      expect(url.href).toBe("http://localhost:4321/api/client-logs");
      expect(init.redirect).toBe("manual");
      expect(init.credentials).toBe("omit");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    }
  });

  it.each([{ TOUGHCROWD_TELEMETRY: "0" }, { DO_NOT_TRACK: "1" }])(
    "opts out before selecting credentials or sending",
    async (env) => {
      const f = fixture(env);
      Object.defineProperty(env, "TOUGHCROWD_API_KEY", {
        get() {
          throw new Error("must not select a credential");
        },
      });
      expect(await runCli(["config", "path"], f.runtime)).toBe(0);
      expect(f.requests).toEqual([]);
    },
  );

  it.each([
    [],
    ["--help"],
    ["--version"],
    ["session", "--help"],
    ["auth"],
    ["incident", "note", "--help"],
    ["session", "new", "--help"],
    ["unknown"],
    ["session", "unknown"],
  ])("excludes help/version and unknown command %j", async (...parts) => {
    const f = fixture();
    await runCli(parts as string[], f.runtime);
    expect(f.requests).toEqual([]);
  });

  it.each([
    ["session", "new"],
    ["session", "list", "--limit", "canary"],
    ["session", "list", "--unknown"],
  ])("includes recognized validation failures %j", async (...parts) => {
    const f = fixture();
    expect(await runCli(parts as string[], f.runtime)).toBe(2);
    expect(f.events()).toHaveLength(2);
    expect(f.events()[1]).toMatchObject({
      outcome: "failure",
      exitCode: 2,
      error: { kind: "usage", code: "invalid-arguments" },
    });
    expect(JSON.stringify(f.events())).not.toContain("canary");
  });

  it("preserves malformed business request context through rendering and excludes canaries", async () => {
    const f = fixture({ TOUGHCROWD_API_KEY: "secret-canary" });
    f.runtime.fetch = async () =>
      await Promise.resolve(
        Response.json(
          { sensitive: "body-canary" },
          { headers: { "x-request-id": "business-request-123" } },
        ),
      );
    expect(
      await runCli(["session", "list", "--repo", "repo-canary"], f.runtime),
    ).toBe(1);
    expect(f.events()[1]).toMatchObject({
      outcome: "failure",
      error: {
        kind: "malformed-response",
        code: "response-schema-invalid",
        name: "ApiClientError",
      },
      api: {
        method: "GET",
        route: "/api/sessions",
        status: 200,
        requestId: "business-request-123",
      },
    });
    expect(JSON.stringify(f.events())).not.toMatch(
      /secret-canary|body-canary|repo-canary/,
    );
    expect(f.stderr.write).toHaveBeenCalledWith(
      "Could not list sessions: the Tough Crowd API returned an invalid response.\n",
    );
    expect(new Headers(f.requests[1].init.headers).get("authorization")).toBe(
      "Bearer secret-canary",
    );
  });

  it("uses a command-resolved credential only on the selected origin", async () => {
    const f = fixture({ TOUGHCROWD_API_ORIGIN: "http://localhost:4321" });
    f.read.mockImplementation(() => Promise.resolve("stored-canary"));
    f.runtime.fetch = async () =>
      await Promise.resolve(
        Response.json(
          { error: { code: "client-upgrade-required", message: "upgrade" } },
          { status: 426 },
        ),
      );
    expect(await runCli(["session", "list"], f.runtime)).toBe(1);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(
      new Headers(f.requests[0].init.headers).get("authorization"),
    ).toBeNull();
    expect(new Headers(f.requests[1].init.headers).get("authorization")).toBe(
      "Bearer stored-canary",
    );
    expect(f.events()[1]).toMatchObject({
      error: { code: "client-upgrade-required", kind: "api" },
    });
  });

  it.each([400, 404, 413, 429, 503, 302])(
    "silently drops ingestion rejection %s without retries",
    async (status) => {
      const f = fixture();
      const send = vi.fn(() =>
        Promise.resolve(Response.json({ schemaVersion: 999 }, { status })),
      );
      f.runtime.telemetryFetch = send;
      expect(await runCli(["config", "path"], f.runtime)).toBe(0);
      expect(send).toHaveBeenCalledTimes(2);
      expect(f.stderr.write).not.toHaveBeenCalled();
    },
  );

  it("bounds uncooperative transport and clears all deadline timers", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const timers = {
      setTimeout: vi.fn((callback: () => void, delayMs: number) =>
        setTimeout(callback, delayMs),
      ),
      clearTimeout: vi.fn((id: unknown) =>
        clearTimeout(id as ReturnType<typeof setTimeout>),
      ),
    };
    const reporter = createTelemetry({
      version: "0.8.0",
      timers,
      fetch: (_url, init) => {
        signals.push(init.signal!);
        return new Promise(() => {});
      },
    })!;
    reporter.start("config path", {});
    const finished = reporter.finish(0, undefined, false, {});
    await vi.advanceTimersByTimeAsync(500);
    await finished;
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(timers.setTimeout.mock.calls.map((call) => call[1])).toEqual([
      500, 500, 500,
    ]);
  });

  it("interrupts stalled finalization after the command action completes", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    f.runtime.signal = controller.signal;
    const signals: AbortSignal[] = [];
    let terminalStarted!: () => void;
    const finalizing = new Promise<void>((resolve) => {
      terminalStarted = resolve;
    });
    f.runtime.telemetryFetch = (_url, init) => {
      signals.push(init.signal!);
      const envelope = JSON.parse(init.body as string) as {
        entries: { event: string }[];
      };
      if (envelope.entries[0].event === "cli.command.finished") {
        terminalStarted();
      }
      // Deliberately ignore abort: shutdown must clean up its own wait/timers.
      return new Promise(() => {});
    };
    const settled = vi.fn();
    const running = runCli(["config", "path"], f.runtime).then((code) => {
      settled(code);
      return code;
    });
    await finalizing;
    expect(f.stdout.write).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith(130);
    expect(await running).toBe(130);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(
      signals.every(
        (signal) => getEventListeners(signal, "abort").length === 0,
      ),
    ).toBe(true);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.stderr.write).not.toHaveBeenCalled();
  });

  it("reports cancellation with an independent flush signal", async () => {
    const f = fixture({ TOUGHCROWD_API_KEY: "canary" });
    const controller = new AbortController();
    f.runtime.signal = controller.signal;
    f.runtime.fetch = () => {
      controller.abort();
      return Promise.reject(new Error("cancellation-canary"));
    };
    expect(await runCli(["session", "list"], f.runtime)).toBe(130);
    expect(f.events()[1]).toMatchObject({ outcome: "canceled", exitCode: 130 });
    expect(f.events()[1]).not.toHaveProperty("error");
    expect(f.events()[1]).not.toHaveProperty("api");
    expect(f.requests.every((r) => !r.init.signal?.aborted)).toBe(true);
  });

  it("keeps concurrent invocations isolated", async () => {
    const a = fixture();
    const b = fixture();
    await Promise.all([
      runCli(["config", "path"], a.runtime),
      runCli(["session", "new"], b.runtime),
    ]);
    expect(a.events()[0].invocationId).not.toBe(b.events()[0].invocationId);
    expect(a.events()[1].outcome).toBe("success");
    expect(b.events()[1].outcome).toBe("failure");
  });

  it("keeps a long command started until normal work completes", async () => {
    const f = fixture({ TOUGHCROWD_API_KEY: "canary" });
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.runtime.fetch = async () => {
      entered();
      await blocked;
      return Response.json(
        { error: { code: "not-found", message: "message-canary" } },
        { status: 404 },
      );
    };
    const running = runCli(["session", "list"], f.runtime);
    await started;
    expect(f.events().map((event) => event.event)).toEqual([
      "cli.command.started",
    ]);
    release();
    expect(await running).toBe(1);
    expect(f.events().map((event) => event.event)).toEqual([
      "cli.command.started",
      "cli.command.finished",
    ]);
  });

  it("retains unexpected package diagnostics through command wrappers", async () => {
    const f = fixture({ TOUGHCROWD_API_KEY: "canary" });
    f.runtime.createIdempotencyKey = () => {
      throw new TypeError("message-canary");
    };
    expect(
      await runCli(
        [
          "session",
          "new",
          "prompt-canary",
          "--repo",
          "acme/repo",
          "--no-defaults",
        ],
        f.runtime,
      ),
    ).toBe(1);
    expect(f.events()[1]).toMatchObject({
      error: { kind: "unexpected", code: "unknown", name: "TypeError" },
    });
    expect(JSON.stringify(f.events())).not.toMatch(
      /message-canary|prompt-canary|acme/,
    );
    expect(f.events()[1]).not.toHaveProperty("api");
  });

  it("classifies invalid config keys as expected usage failures", async () => {
    const f = fixture({
      TOUGHCROWD_CONFIG: "/nonexistent-directory-canary/config.json",
    });
    expect(await runCli(["config", "unset", "key-canary"], f.runtime)).toBe(1);
    expect(f.events()[1]).toMatchObject({
      error: {
        kind: "usage",
        code: "invalid-configuration",
        name: "ConfigError",
      },
    });
    expect(JSON.stringify(f.events())).not.toMatch(
      /key-canary|nonexistent-directory-canary/,
    );
  });

  it("retains local I/O failures through file-input wrapping", async () => {
    const f = fixture({ TOUGHCROWD_API_KEY: "canary" });
    expect(
      await runCli(
        [
          "incident",
          "note",
          "11111111-1111-4111-8111-111111111111",
          "--body-file",
          "/nonexistent-directory-canary/missing.txt",
        ],
        f.runtime,
      ),
    ).toBe(2);
    expect(f.events()[1]).toMatchObject({
      error: { kind: "local-I/O", code: "ENOENT", name: "Error" },
    });
    expect(JSON.stringify(f.events())).not.toContain(
      "nonexistent-directory-canary",
    );
  });

  it("drops offline reports without recursion or diagnostics", async () => {
    const f = fixture();
    const send = vi.fn(() => Promise.reject(new Error("offline-canary")));
    f.runtime.telemetryFetch = send;
    expect(await runCli(["config", "path"], f.runtime)).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(f.stderr.write).not.toHaveBeenCalled();
  });

  it("omits credentials resolved for another origin", async () => {
    const f = fixture();
    const reporter = createTelemetry({
      version: "0.8.0",
      env: { TOUGHCROWD_API_ORIGIN: "http://localhost:4321" },
      fetch: f.runtime.telemetryFetch,
    })!;
    const diagnostic = {
      credential: {
        origin: "https://api.toughcrowd.dev",
        key: "other-origin-canary",
      },
    };
    reporter.start("config path", diagnostic);
    await reporter.finish(0, undefined, false, diagnostic);
    expect(
      f.requests.every(
        (r) => !new Headers(r.init.headers).has("authorization"),
      ),
    ).toBe(true);
    expect(
      f.requests.every(
        (r) => Buffer.byteLength(r.init.body as string) <= 16384,
      ),
    ).toBe(true);
  });

  it.each([
    ["auth", "status"],
    ["session", "list"],
  ])(
    "reports native credential reads failing during %j as local I/O",
    async (...args) => {
      const f = fixture();
      f.runtime.credentialStore = createKeyringCredentialStore();
      await nativeKeyring.read.withImplementation(
        () => {
          throw new Error("native-read-canary /private/path");
        },
        async () => {
          expect(await runCli(args as string[], f.runtime)).toBe(1);
        },
      );
      expect(f.events()[1]).toMatchObject({
        outcome: "failure",
        exitCode: 1,
        error: {
          kind: "local-I/O",
          code: "credential-store-unavailable",
          name: "AuthCommandError",
        },
      });
      expect(f.stderr.write).toHaveBeenCalledWith(
        "The operating-system credential store is unavailable. Use TOUGHCROWD_API_KEY for non-interactive authentication, or try again after enabling the OS credential store.\n",
      );
      expect(f.stdout.write).not.toHaveBeenCalled();
      expect(f.events()[1]).not.toHaveProperty("api");
      expect(JSON.stringify(f.events())).not.toMatch(
        /native-read-canary|private\/path/,
      );
      expect(
        f.requests.every(
          (request) => !new Headers(request.init.headers).has("authorization"),
        ),
      ).toBe(true);
    },
  );

  it("reports native credential writes failing after login exchange as local I/O", async () => {
    const f = fixture();
    const key = `tc_key_${"A".repeat(22)}_${"B".repeat(43)}`;
    const close = vi.fn(() => Promise.resolve());
    f.runtime.credentialStore = createKeyringCredentialStore();
    f.runtime.bindLoopbackListener = () =>
      Promise.resolve({
        callbackUri: "http://127.0.0.1:43123/callback",
        waitForCallback: () =>
          Promise.resolve({
            kind: "approved",
            code: "authorization-code-canary",
          }),
        close,
      });
    f.runtime.openUrl = () => Promise.resolve(true);
    f.runtime.fetch = (url) =>
      Promise.resolve(
        Response.json(
          url.pathname.endsWith("/exchange")
            ? {
                key,
                apiKey: {
                  id: "11111111-1111-4111-8111-111111111111",
                  name: "CLI key",
                  createdAt: "2026-10-30T18:00:00.000Z",
                },
                user: {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "User",
                  email: "user@example.com",
                },
              }
            : {
                authorizationUrl:
                  "https://app.toughcrowd.dev/cli/authorize?request=test",
                expiresAt: "2026-10-30T18:05:00.000Z",
              },
        ),
      );
    await nativeKeyring.write.withImplementation(
      () => {
        throw new Error(`native-write-canary ${key}`);
      },
      async () => {
        expect(await runCli(["auth", "login"], f.runtime)).toBe(1);
      },
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(f.stdout.write).toHaveBeenCalledExactlyOnceWith(
      "Authorize Tough Crowd CLI: https://app.toughcrowd.dev/cli/authorize?request=test\n",
    );
    expect(f.stderr.write).toHaveBeenCalledExactlyOnceWith(
      "The operating-system credential store is unavailable. Use TOUGHCROWD_API_KEY for non-interactive authentication, or try again after enabling the OS credential store.\n",
    );
    expect(f.events()[1]).toMatchObject({
      outcome: "failure",
      exitCode: 1,
      error: {
        kind: "local-I/O",
        code: "credential-store-unavailable",
        name: "AuthCommandError",
      },
    });
    expect(f.events()[1]).not.toHaveProperty("api");
    expect(JSON.stringify(f.events())).not.toMatch(
      /native-write-canary|authorization-code-canary|tc_key_/,
    );
    expect(
      f.requests.every(
        (request) => !new Headers(request.init.headers).has("authorization"),
      ),
    ).toBe(true);
  });

  it("keeps ordinary authentication errors in the expected authentication category", () => {
    const error = new AuthCommandError("invalid-credential-canary");
    error.stack = undefined;
    expect(safeDiagnostic(error)).toEqual({
      error: {
        kind: "authentication",
        code: "unknown",
        name: "AuthCommandError",
      },
    });
  });

  it("normalizes only package frames and never walks causes or sends arbitrary diagnostics", () => {
    expect(
      safeFrames(
        "Error: secret\n    at fn (/pkg/dist/cli.js:4:8)\n    at fn (/home/canary.js:1:2)\n    at fn (/pkg/node_modules/secret.js:1:2)\n    at fn (/pkg/src/../secret.js:1:2)",
        "/pkg",
      ),
    ).toEqual([{ file: "dist/cli.js", line: 4, column: 8 }]);
    const error = new ApiClientError({
      kind: "api",
      message: "message-canary",
      code: "code-canary",
      requestId: "id canary",
      cause: { secret: "cause-canary" },
      status: 403,
    });
    error.stack =
      "Error: stack-canary\n at fn (/private/absolute-canary.js:1:2)";
    expect(safeDiagnostic(error)).toEqual({
      error: { kind: "permission", code: "unknown", name: "ApiClientError" },
      api: { status: 403 },
    });
  });
});
