import { pathToFileURL } from "node:url";

const cliModulePath = process.argv[2];
const cliVersion = process.argv[3];
assert(cliModulePath != null, "installed CLI module path is required");
assert(cliVersion != null, "installed CLI version is required");

const { runCli } = await import(pathToFileURL(cliModulePath).href);
const apiOrigin = "https://api.toughcrowd.dev";
const apiKey = "tc_package_deploy_secret";
const commitSha = "0123456789abcdef0123456789abcdef01234567";
const stdout = createOutput();
const stderr = createOutput();
const fetchCalls = [];

const exitCode = await runCli(["deploy", "record", "--json"], {
  stdout,
  stderr,
  version: cliVersion,
  signal: new AbortController().signal,
  env: {
    TOUGHCROWD_API_ORIGIN: apiOrigin,
    TOUGHCROWD_API_KEY: apiKey,
    GITHUB_REPOSITORY: "acme/web",
    GITHUB_SHA: commitSha,
    GITHUB_RUN_ID: "123456789",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_SERVER_URL: "https://github.com",
  },
  credentialStore: {
    async read() {
      throw new Error("environment authentication must not read keyring");
    },
    async write() {
      throw new Error("deploy record must not write keyring");
    },
  },
  async fetch(url, init) {
    const headers = new Headers(init.headers);
    fetchCalls.push({
      url: String(url),
      method: init.method,
      authorization: headers.get("authorization"),
      idempotencyKey: headers.get("idempotency-key"),
      client: headers.get("x-toughcrowd-client"),
      body: init.body,
    });

    return jsonResponse({
      deployment: {
        id: "44444444-4444-4444-8444-444444444444",
        repository: {
          id: "55555555-5555-4555-8555-555555555555",
          githubRepositoryId: "123456789",
          fullName: "acme/web",
          serverOnly: "discarded",
        },
        commitSha,
        githubActionsRunId: "123456789",
        githubActionsRunAttempt: 2,
        workflowRunUrl: "https://github.com/acme/web/actions/runs/123456789",
        deployedAt: "2026-08-29T12:34:56.000Z",
      },
      associatedSessions: { count: 3 },
      serverOnly: "discarded",
    });
  },
});

assert(exitCode === 0, "installed deploy record returned the wrong exit code");
assert(stderr.value === "", "installed deploy record wrote diagnostics");
assert(fetchCalls.length === 1, "installed deploy record made extra requests");
assert(
  JSON.stringify(fetchCalls[0]) ===
    JSON.stringify({
      url: apiOrigin + "/api/deployments",
      method: "POST",
      authorization: "Bearer " + apiKey,
      idempotencyKey:
        "github-actions:acme/web:0123456789abcdef0123456789abcdef01234567:123456789:2",
      client: "@toughcrowd/cli/" + cliVersion,
      body: JSON.stringify({
        repository: { fullName: "acme/web" },
        commitSha,
        githubActionsRunId: "123456789",
        githubActionsRunAttempt: 2,
        workflowRunUrl: "https://github.com/acme/web/actions/runs/123456789",
      }),
    }),
  "installed deploy record sent the wrong request",
);
assert(
  stdout.value ===
    `{"deployment":{"id":"44444444-4444-4444-8444-444444444444","repository":{"id":"55555555-5555-4555-8555-555555555555","githubRepositoryId":"123456789","fullName":"acme/web"},"commitSha":"${commitSha}","githubActionsRunId":"123456789","githubActionsRunAttempt":2,"workflowRunUrl":"https://github.com/acme/web/actions/runs/123456789","deployedAt":"2026-08-29T12:34:56.000Z"},"associatedSessions":{"count":3}}\n`,
  "installed deploy record returned the wrong JSON document",
);
assert(
  !stdout.value.includes("serverOnly") &&
    !stdout.value.includes(apiKey) &&
    !stderr.value.includes(apiKey),
  "installed deploy record exposed discarded or secret values",
);

process.stdout.write("Verified installed deploy record\n");

function createOutput() {
  return {
    value: "",
    write(value) {
      this.value += value;
    },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
