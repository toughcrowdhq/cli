import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "./cli.js";
import type { CredentialStore } from "./auth/credentials.js";
import type { HiddenPrompt } from "./auth/prompt.js";

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
      "  login             Authenticate with a Tough Crowd API key\n",
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
Expires: 2027-01-01T00:00:00.000Z
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
        id: "usr_123",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      account: {
        id: "acct_123",
        name: "Analytical Engines",
      },
      key: {
        name: "CLI key",
        expiresAt: "2027-01-01T00:00:00.000Z",
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
    expect(fetch.calls[0].url).toBe(
      "http://localhost:3000/api/cli/auth/identity",
    );
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

  it("login validates before storing and prints the API-key page", async () => {
    const store = createMemoryCredentialStore({});
    const runtime = createRuntime({
      credentialStore: store,
      prompt: createPrompt({ hiddenLine: "tc_new_secret" }),
      fetch: createIdentityFetch("tc_new_secret"),
      openUrl: () => Promise.resolve(true),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.stdout.output).toContain(
      "Create an API key: https://app.toughcrowd.com/settings/api-keys/new\n",
    );
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_new_secret");
    expect(runtime.stdout.output).not.toContain("tc_new_secret");
    expect(runtime.stderr.output).toBe("");
  });

  it("login confirms before replacing an existing stored key", async () => {
    const store = createMemoryCredentialStore({
      "https://api.toughcrowd.com": "tc_old_secret",
    });
    const runtime = createRuntime({
      credentialStore: store,
      prompt: createPrompt({ hiddenLine: "tc_new_secret", confirm: false }),
      fetch: createIdentityFetch("tc_new_secret"),
      openUrl: () => Promise.resolve(false),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(store.values["https://api.toughcrowd.com"]).toBe("tc_old_secret");
    expect(runtime.stderr.output).toBe(
      "Authentication canceled. Existing credential was left unchanged.\n",
    );
  });

  it("login does not store when validation fails", async () => {
    const store = createMemoryCredentialStore({});
    const runtime = createRuntime({
      credentialStore: store,
      prompt: createPrompt({ hiddenLine: "tc_bad_secret" }),
      fetch: createApiErrorFetch("Revoked API key"),
      openUrl: () => Promise.resolve(false),
    });

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(1);
    expect(store.values).toEqual({});
    expect(runtime.stderr.output).toBe(
      "Authentication failed: Revoked API key\n",
    );
    expect(runtime.stderr.output).not.toContain("tc_bad_secret");
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
      | "prompt"
      | "fetch"
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
    prompt: overrides.prompt ?? createPrompt({ hiddenLine: "tc_secret" }),
    fetch: overrides.fetch,
    openUrl: overrides.openUrl ?? (() => Promise.resolve(false)),
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
} {
  const storedValues = { ...values };
  return {
    values: storedValues,
    read(apiOrigin) {
      return Promise.resolve(storedValues[apiOrigin] ?? null);
    },
    write(apiOrigin, apiKey) {
      storedValues[apiOrigin] = apiKey;
      return Promise.resolve();
    },
  };
}

function createPrompt(options: {
  hiddenLine: string;
  confirm?: boolean;
  isInteractive?: boolean;
}): HiddenPrompt {
  return {
    isInteractive: options.isInteractive ?? true,
    readHiddenLine() {
      return Promise.resolve(options.hiddenLine);
    },
    confirm() {
      return Promise.resolve(options.confirm ?? true);
    },
  };
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
        user: {
          id: "usr_123",
          email: "ada@example.com",
          name: "Ada Lovelace",
        },
        account: {
          id: "acct_123",
          name: "Analytical Engines",
        },
        key: {
          id: "key_123",
          name: "CLI key",
          expiresAt: "2027-01-01T00:00:00.000Z",
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
  calls: { url: string; authorization: string | null }[];
}

function createFetch(
  responder: (url: URL, init: RequestInit) => Response | Promise<Response>,
): TestFetch {
  const fetch = (async (url: URL, init: RequestInit) => {
    fetch.calls.push({
      url: url.toString(),
      authorization: new Headers(init.headers).get("authorization"),
    });
    return await responder(url, init);
  }) as TestFetch;
  fetch.calls = [];
  return fetch;
}
