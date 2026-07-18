import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "./cli.js";
import type { CredentialStore } from "./auth/credentials.js";
import {
  LoopbackAuthorizationError,
  type BindLoopbackListenerOptions,
  type LoopbackCallback,
  type LoopbackListenerFactory,
} from "./auth/loopback.js";

const authorizationUrl =
  "https://app.toughcrowd.com/cli/authorize#request=browser-request";
const authorizationState = "sssssssssssssssssssssssssssssssssssssssssss";
const codeVerifier = "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv";
const codeChallenge = "ccccccccccccccccccccccccccccccccccccccccccc";
const authorizationCode =
  "tc_cli_code_abcdefghijklmnopqrstuv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const exchangedApiKey =
  "tc_key_abcdefghijklmnopqrstuv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

const rootHelp = `Usage: toughcrowd [options] [command]

The command-line client for Tough Crowd

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  auth            Manage Tough Crowd authentication
  help [command]  display help for command
`;

describe("Tough Crowd CLI", () => {
  it("prints root help successfully when invoked without arguments", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli([], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(rootHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("prints the same root help for --help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(rootHelp);
    expect(runtime.stderr.output).toBe("");
  });

  it("prints the package version for --version", async () => {
    const runtime = createRuntime({ version: "0.1.0" });

    const exitCode = await runCli(["--version"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe("0.1.0\n");
    expect(runtime.stderr.output).toBe("");
  });

  it("rejects unknown commands", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["session"], runtime);

    expect(exitCode).toBe(2);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe("error: unknown command 'session'\n");
  });

  it("rejects unknown options", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["--repo"], runtime);

    expect(exitCode).toBe(2);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe("error: unknown option '--repo'\n");
  });

  it("rejects excess positional arguments", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["--", "extra"], runtime);

    expect(exitCode).toBe(2);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe("error: unknown command 'extra'\n");
  });

  it("can run repeatedly with independent injected streams", async () => {
    const firstRuntime = createRuntime({ version: "1.0.0" });
    const secondRuntime = createRuntime({ version: "2.0.0" });

    const firstExitCode = await runCli(["--version"], firstRuntime);
    const secondExitCode = await runCli(["--version"], secondRuntime);

    expect(firstExitCode).toBe(0);
    expect(secondExitCode).toBe(0);
    expect(firstRuntime.stdout.output).toBe("1.0.0\n");
    expect(secondRuntime.stdout.output).toBe("2.0.0\n");
  });

  it("maps an observed interruption to exit code 130", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const runtime = createRuntime({ signal: abortController.signal });

    const exitCode = await runCli([], runtime);

    expect(exitCode).toBe(130);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe("");
  });

  it("formats unexpected root failures without stack traces", async () => {
    const runtime = createRuntime();
    runtime.stdout.write = () => {
      throw new Error("stream unavailable");
    };

    const exitCode = await runCli([], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Unexpected error: stream unavailable\n",
    );
  });

  it("shows auth command help", async () => {
    const runtime = createRuntime();

    const exitCode = await runCli(["auth", "--help"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toContain(
      "Usage: toughcrowd auth [options] [command]\n",
    );
    expect(runtime.stdout.output).toContain(
      "  login             Authenticate through browser approval\n",
    );
    expect(runtime.stdout.output).toContain(
      "  status [options]  Show the active Tough Crowd authentication status\n",
    );
    expect(runtime.stderr.output).toBe("");
  });

  it("reports valid stored authentication status without exposing the key", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_stored_secret",
    });
    const fetch = createIdentityFetch("tc_stored_secret");
    const runtime = createRuntime({ credentialStore: store, fetch });

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toBe(`Authenticated as ada@example.com
API origin: https://api.toughcrowd.com
Credential source: stored
API key: CLI key
`);
    expect(runtime.stderr.output).toBe("");
    expect(runtime.stdout.output).not.toContain("tc_stored_secret");
    expect(runtime.stderr.output).not.toContain("tc_stored_secret");
  });

  it("prints bounded JSON authentication status", async () => {
    const fetch = createIdentityFetch("tc_env_secret");
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_env_secret" },
      credentialStore: createMemoryCredentialStore({
        "https://api.toughcrowd.com": "tc_stored_secret",
      }),
      fetch,
    });

    const exitCode = await runCli(["auth", "status", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(JSON.parse(runtime.stdout.output)).toEqual({
      authenticated: true,
      apiOrigin: "https://api.toughcrowd.com",
      credentialSource: "environment",
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      key: {
        name: "CLI key",
      },
    });
    expect(runtime.stdout.output).not.toContain("tc_env_secret");
  });

  it("does not read stored credentials when TOUGHCROWD_API_KEY is set", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_env_secret" },
      credentialStore: {
        read() {
          throw new Error("stored credential should not be read");
        },
        write() {
          throw new Error("stored credential should not be written");
        },
      },
      fetch: createIdentityFetch("tc_env_secret"),
    });

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stderr.output).toBe("");
  });

  it("isolates stored credentials by exact API origin", async () => {
    const fetch = createIdentityFetch("tc_local_secret");
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_ORIGIN: "http://localhost:3000" },
      credentialStore: createMemoryCredentialStore({
        "https://api.toughcrowd.com": "tc_prod_secret",
        "http://localhost:3000": "tc_local_secret",
      }),
      fetch,
    });

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(0);
    expect(fetch.calls[0].url).toBe("http://localhost:3000/api/me");
    expect(fetch.calls[0].authorization).toBe("Bearer tc_local_secret");
  });

  it("fails status when no credential is available", async () => {
    const runtime = createRuntime({
      credentialStore: createMemoryCredentialStore({}),
    });

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Not authenticated for https://api.toughcrowd.com. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.\n",
    );
  });

  it("fails status for invalid credentials without exposing the key", async () => {
    const runtime = createRuntime({
      env: { TOUGHCROWD_API_KEY: "tc_bad_secret" },
      fetch: createApiErrorFetch("Invalid API key"),
    });

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Authentication failed: Invalid API key\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_bad_secret");
  });

  it("completes browser authorization, stores the exchanged key, and prints safe identity", async () => {
    const store = createMemoryCredentialStore({});
    const loopback = createLoopbackHarness();
    const fetch = createAuthorizationFetch();
    const openedUrls: string[] = [];
    const runtime = createRuntime({
      version: "0.2.0",
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch,
      openUrl(url) {
        openedUrls.push(url);
        return Promise.resolve(true);
      },
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output)
      .toBe(`Authorize Tough Crowd CLI: ${authorizationUrl}
Authenticated as ada@example.com
API origin: https://api.toughcrowd.com
Credential source: stored
API key: Tough Crowd CLI 0.2.0 abcdef12
`);
    expect(runtime.stderr.output).toBe("");
    expect(openedUrls).toEqual([authorizationUrl]);
    expect(store.values).toEqual({
      "https://api.toughcrowd.com": exchangedApiKey,
    });
    expect(store.writes).toEqual([
      {
        apiOrigin: "https://api.toughcrowd.com",
        apiKey: exchangedApiKey,
      },
    ]);
    expect(loopback.binds).toHaveLength(1);
    expect(loopback.binds[0].state).toBe(authorizationState);
    expect(loopback.listeners[0].closeCalls).toBe(1);
    expect(fetch.calls.map((call) => call.url)).toEqual([
      "https://api.toughcrowd.com/api/cli-authorizations",
      "https://api.toughcrowd.com/api/cli-authorizations/exchange",
    ]);
    expect(fetch.calls[0].body).toBe(
      JSON.stringify({
        callbackUri: "http://127.0.0.1:49152/callback",
        codeChallenge: "ccccccccccccccccccccccccccccccccccccccccccc",
        codeChallengeMethod: "S256",
        state: "sssssssssssssssssssssssssssssssssssssssssss",
        clientName: "Tough Crowd CLI 0.2.0",
      }),
    );
    expect(fetch.calls[1].body).toBe(
      JSON.stringify({
        code: authorizationCode,
        codeVerifier,
      }),
    );
    expect(runtime.stdout.output).not.toContain(authorizationCode);
    expect(runtime.stdout.output).not.toContain(authorizationState);
    expect(runtime.stdout.output).not.toContain(codeVerifier);
    expect(runtime.stdout.output).not.toContain(exchangedApiKey);
  });

  it("replaces an existing stored credential only after a successful exchange", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: createLoopbackHarness().factory,
      fetch: createAuthorizationFetch(),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(0);
    expect(store.reads).toEqual([]);
    expect(store.values["https://api.toughcrowd.com"]).toBe(exchangedApiKey);
    expect(store.writes).toHaveLength(1);
  });

  it("leaves the existing credential unchanged after browser denial", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness({ callback: { kind: "denied" } });
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch(),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(store.writes).toEqual([]);
    expect(loopback.listeners[0].closeCalls).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Authentication was denied. Existing credential was left unchanged.\n",
    );
  });

  it("leaves the existing credential unchanged after timeout", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness({
      waitError: new LoopbackAuthorizationError(
        "timeout",
        "sensitive timeout details",
      ),
    });
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch(),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(loopback.listeners[0].closeCalls).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Authentication timed out. Existing credential was left unchanged.\n",
    );
    expect(runtime.stderr.output).not.toContain("sensitive timeout details");
  });

  it("closes the listener when browser login is canceled", async () => {
    const abortController = new AbortController();
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness({ waitForAbort: true });
    const runtime = createRuntime({
      signal: abortController.signal,
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch(),
      openUrl() {
        abortController.abort();
        return Promise.resolve(true);
      },
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(130);
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(store.writes).toEqual([]);
    expect(loopback.listeners[0].closeCalls).toBe(1);
    expect(runtime.stderr.output).toBe("");
  });

  it("fails safely when the loopback listener cannot bind", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness({
      bindError: new LoopbackAuthorizationError(
        "listen",
        "bind failed on secret port",
      ),
    });
    const fetch = createAuthorizationFetch();
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch,
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Authentication failed: could not start the local callback listener. Use TOUGHCROWD_API_KEY for non-interactive authentication.\n",
    );
    expect(runtime.stderr.output).not.toContain("secret port");
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(fetch.calls).toEqual([]);
  });

  it("closes the listener when authorization cannot be started", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness();
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch({ startRejected: true }),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stdout.output).toBe("");
    expect(runtime.stderr.output).toBe(
      "Authentication failed: Authorization request was rejected.\n",
    );
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(store.writes).toEqual([]);
    expect(loopback.listeners[0].closeCalls).toBe(1);
  });

  it("reports an unstructured API 500 without crashing listener cleanup", async () => {
    const loopback = createLoopbackHarness();
    const runtime = createRuntime({
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch({ startInternalError: true }),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Authentication failed: the Tough Crowd API returned an internal error.\n",
    );
    expect(loopback.listeners[0].closeCalls).toBe(1);
  });

  it.each(["returned false", "threw an error"])(
    "continues when opening the browser %s",
    async (failureMode) => {
      const loopback = createLoopbackHarness();
      const runtime = createRuntime({
        bindLoopbackListener: loopback.factory,
        fetch: createAuthorizationFetch(),
        openUrl() {
          if (failureMode === "threw an error") {
            return Promise.reject(new Error("browser command leaked details"));
          }
          return Promise.resolve(false);
        },
      });

      const exitCode = await runCli(["auth", "login"], runtime);

      expect(exitCode).toBe(0);
      expect(runtime.stderr.output).toBe(
        "Could not open a browser automatically. Open the authorization URL shown above to continue.\n",
      );
      expect(runtime.stderr.output).not.toContain(
        "browser command leaked details",
      );
      expect(runtime.stdout.output).toContain(
        "Authenticated as ada@example.com\n",
      );
      expect(loopback.listeners[0].closeCalls).toBe(1);
    },
  );

  it("closes the listener and preserves the old key when exchange reports expiry", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const loopback = createLoopbackHarness();
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch({ exchangeExpired: true }),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Authentication failed: Authorization code expired.\n",
    );
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(store.writes).toEqual([]);
    expect(loopback.listeners[0].closeCalls).toBe(1);
  });

  it("does not expose code, state, verifier, or API key material on exchange failure", async () => {
    const loopback = createLoopbackHarness();
    const runtime = createRuntime({
      bindLoopbackListener: loopback.factory,
      fetch: createAuthorizationFetch({ exchangeDeniedWithDebug: true }),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);
    const output = `${runtime.stdout.output}${runtime.stderr.output}`;

    expect(exitCode).toBe(1);
    expect(runtime.stderr.output).toBe(
      "Authentication failed: Authorization code is invalid.\n",
    );
    expect(output).not.toContain(authorizationCode);
    expect(output).not.toContain(authorizationState);
    expect(output).not.toContain(codeVerifier);
    expect(output).not.toContain(exchangedApiKey);
    expect(loopback.listeners[0].closeCalls).toBe(1);
  });

  it("can complete browser login repeatedly in one process", async () => {
    const store = createMemoryCredentialStore({});
    const loopback = createLoopbackHarness();
    const fetch = createAuthorizationFetch();
    const runtime = createRuntime({
      credentialStore: store,
      bindLoopbackListener: loopback.factory,
      fetch,
      openUrl: () => Promise.resolve(true),
    });

    const firstExitCode = await runCli(["auth", "login"], runtime);
    const secondExitCode = await runCli(["auth", "login"], runtime);

    expect([firstExitCode, secondExitCode]).toEqual([0, 0]);
    expect(loopback.listeners.map((listener) => listener.closeCalls)).toEqual([
      1, 1,
    ]);
    expect(fetch.calls.map((call) => call.url)).toEqual([
      "https://api.toughcrowd.com/api/cli-authorizations",
      "https://api.toughcrowd.com/api/cli-authorizations/exchange",
      "https://api.toughcrowd.com/api/cli-authorizations",
      "https://api.toughcrowd.com/api/cli-authorizations/exchange",
    ]);
    expect(store.writes).toHaveLength(2);
  });
});

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
      | "createAuthorizationSecrets"
      | "bindLoopbackListener"
      | "openUrl"
    >
  > = {},
): CliRuntime & { stdout: CapturedWritable; stderr: CapturedWritable } {
  return {
    stdout: createWritable(),
    stderr: createWritable(),
    version: overrides.version ?? "0.0.0-test",
    signal: overrides.signal ?? new AbortController().signal,
    env: overrides.env,
    credentialStore:
      overrides.credentialStore ?? createMemoryCredentialStore({}),
    fetch: overrides.fetch,
    createAuthorizationSecrets:
      overrides.createAuthorizationSecrets ??
      (() => ({
        state: authorizationState,
        codeVerifier,
        codeChallenge,
        codeChallengeMethod: "S256",
      })),
    bindLoopbackListener:
      overrides.bindLoopbackListener ?? createLoopbackHarness().factory,
    openUrl: overrides.openUrl ?? (() => Promise.resolve(true)),
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
): CredentialStore & {
  values: Record<string, string>;
  reads: string[];
  writes: Array<{ apiOrigin: string; apiKey: string }>;
} {
  const storedValues = { ...values };
  const reads: string[] = [];
  const writes: Array<{ apiOrigin: string; apiKey: string }> = [];
  return {
    values: storedValues,
    reads,
    writes,
    read(apiOrigin) {
      reads.push(apiOrigin);
      return Promise.resolve(storedValues[apiOrigin] ?? null);
    },
    write(apiOrigin, apiKey) {
      writes.push({ apiOrigin, apiKey });
      storedValues[apiOrigin] = apiKey;
      return Promise.resolve();
    },
  };
}

interface LoopbackHarness {
  factory: LoopbackListenerFactory;
  binds: BindLoopbackListenerOptions[];
  listeners: Array<{ closeCalls: number }>;
}

function createLoopbackHarness(
  options: {
    callback?: LoopbackCallback;
    waitError?: Error;
    bindError?: Error;
    waitForAbort?: boolean;
  } = {},
): LoopbackHarness {
  const binds: BindLoopbackListenerOptions[] = [];
  const listeners: Array<{ closeCalls: number }> = [];

  return {
    binds,
    listeners,
    factory(bindOptions) {
      binds.push(bindOptions);
      if (options.bindError != null) return Promise.reject(options.bindError);

      const listenerState = { closeCalls: 0 };
      listeners.push(listenerState);

      return Promise.resolve({
        callbackUri: "http://127.0.0.1:49152/callback",
        waitForCallback() {
          if (options.waitForAbort === true) {
            return rejectWhenAborted(bindOptions.signal);
          }
          if (options.waitError != null) {
            return Promise.reject(options.waitError);
          }
          return Promise.resolve(
            options.callback ?? {
              kind: "approved",
              code: authorizationCode,
            },
          );
        },
        close() {
          listenerState.closeCalls += 1;
          return Promise.resolve();
        },
      });
    },
  };
}

function rejectWhenAborted(signal: AbortSignal): Promise<LoopbackCallback> {
  return new Promise((_resolve, reject) => {
    const rejectCanceled = (): void => {
      reject(
        new LoopbackAuthorizationError(
          "canceled",
          "callback contained sensitive cancellation details",
        ),
      );
    };

    if (signal.aborted) {
      rejectCanceled();
      return;
    }
    signal.addEventListener("abort", rejectCanceled, { once: true });
  });
}

function createAuthorizationFetch(
  options: {
    startRejected?: boolean;
    startInternalError?: boolean;
    exchangeExpired?: boolean;
    exchangeDeniedWithDebug?: boolean;
  } = {},
): TestFetch {
  return createFetch((url) => {
    if (url.pathname === "/api/cli-authorizations") {
      if (options.startInternalError === true) {
        return jsonResponse({ message: "Internal server error." }, 500);
      }
      if (options.startRejected === true) {
        return jsonResponse(
          {
            error: {
              code: "validation-failed",
              message: "Authorization request was rejected.",
              requestId: "req_start_rejected",
            },
          },
          422,
        );
      }
      return jsonResponse(
        {
          authorizationUrl,
          expiresAt: "2026-07-18T20:10:00.000Z",
        },
        201,
      );
    }

    if (url.pathname !== "/api/cli-authorizations/exchange") {
      throw new Error(`Unexpected authorization request: ${url.pathname}`);
    }

    if (options.exchangeExpired === true) {
      return jsonResponse(
        {
          error: {
            code: "conflict",
            message: "Authorization code expired.",
            requestId: "req_expired",
          },
        },
        409,
      );
    }

    if (options.exchangeDeniedWithDebug === true) {
      return jsonResponse(
        {
          error: {
            code: "authorization-denied",
            message: "Authorization code is invalid.",
            requestId: "req_denied",
          },
          debug: {
            code: authorizationCode,
            state: authorizationState,
            verifier: codeVerifier,
            apiKey: exchangedApiKey,
          },
        },
        403,
      );
    }

    return jsonResponse({
      key: exchangedApiKey,
      apiKey: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Tough Crowd CLI 0.2.0 abcdef12",
        createdAt: "2026-07-18T20:01:00.000Z",
      },
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    });
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createIdentityFetch(expectedApiKey: string): TestFetch {
  return createFetch((url, init) => {
    const authorization = new Headers(init.headers).get("authorization");
    if (authorization !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({
          error: { code: "invalid_api_key", message: "Invalid API key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "ada@example.com",
          name: "Ada Lovelace",
          role: "user",
        },
        impersonation: {
          isImpersonating: false,
          impersonatedBy: null,
        },
        credential: {
          type: "api-key",
          id: "11111111-1111-4111-8111-111111111111",
          name: "CLI key",
          createdAt: "2026-07-18T20:01:00.000Z",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

function createApiErrorFetch(message: string): TestFetch {
  return createFetch(() => {
    return new Response(
      JSON.stringify({
        error: { code: "invalid_api_key", message },
        requestId: "req_123",
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  });
}

interface TestFetch {
  (input: URL, init: RequestInit): Promise<Response>;
  calls: Array<{
    url: string;
    authorization: string | null;
    body: BodyInit | null | undefined;
  }>;
}

function createFetch(
  responder: (url: URL, init: RequestInit) => Response | Promise<Response>,
): TestFetch {
  const fetch = (async (url: URL, init: RequestInit) => {
    fetch.calls.push({
      url: url.toString(),
      authorization: new Headers(init.headers).get("authorization"),
      body: init.body,
    });
    return await responder(url, init);
  }) as TestFetch;
  fetch.calls = [];
  return fetch;
}
