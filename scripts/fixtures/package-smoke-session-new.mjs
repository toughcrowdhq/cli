import { pathToFileURL } from "node:url";

const cliModulePath = process.argv[2];
const cliVersion = process.argv[3];
assert(cliModulePath != null, "installed CLI module path is required");
assert(cliVersion != null, "installed CLI version is required");

const { runCli } = await import(pathToFileURL(cliModulePath).href);
const apiOrigin = "https://api.toughcrowd.dev";
const apiKey = "tc_package_create_secret";
const idempotencyKey = "package-create-idempotency";
const stdout = createOutput();
const stderr = createOutput();
const fetchCalls = [];
let idempotencyKeyCalls = 0;

const exitCode = await runCli(
  [
    "session",
    "new",
    "Fix the package checkout test",
    "--repo",
    "acme/web",
    "--base-branch",
    "main",
    "--title",
    "Fix package checkout",
    "--json",
  ],
  {
    stdout,
    stderr,
    version: cliVersion,
    signal: new AbortController().signal,
    env: {
      TOUGHCROWD_API_ORIGIN: apiOrigin,
      TOUGHCROWD_API_KEY: apiKey,
    },
    credentialStore: {
      async read() {
        throw new Error("environment authentication must not read keyring");
      },
      async write() {
        throw new Error("session creation must not write keyring");
      },
    },
    async readGitOrigin() {
      throw new Error("literal repository must not inspect Git");
    },
    createIdempotencyKey() {
      idempotencyKeyCalls += 1;
      return idempotencyKey;
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
        session: {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Fix package checkout",
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
          initialPrompt: "not part of the CLI JSON contract",
          events: [],
        },
      });
    },
  },
);

assert(exitCode === 0, "installed session new returned the wrong exit code");
assert(stderr.value === "", "installed session new wrote diagnostics");
assert(idempotencyKeyCalls === 1, "session new generated extra keys");
assert(fetchCalls.length === 1, "installed session new made extra requests");
assert(
  JSON.stringify(fetchCalls[0]) ===
    JSON.stringify({
      url: apiOrigin + "/api/sessions",
      method: "POST",
      authorization: "Bearer " + apiKey,
      idempotencyKey,
      client: "@toughcrowd/cli/" + cliVersion,
      body: JSON.stringify({
        prompt: "Fix the package checkout test",
        repository: "acme/web",
        baseBranch: "main",
        title: "Fix package checkout",
      }),
    }),
  "installed session new sent the wrong request",
);
assert(
  stdout.value ===
    '{"session":{"id":"33333333-3333-4333-8333-333333333333","status":"queued","repository":{"fullName":"acme/web"},"agentProfile":{"id":"codex-cli-default","name":"Codex CLI"},"title":"Fix package checkout"}}\n',
  "installed session new returned the wrong JSON document",
);
assert(
  !stdout.value.includes("initialPrompt") &&
    !stdout.value.includes("serverOnly") &&
    !stdout.value.includes(apiKey) &&
    !stderr.value.includes(apiKey),
  "installed session new exposed discarded or secret values",
);

process.stdout.write("Verified installed session new\n");

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
