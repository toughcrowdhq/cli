import { pathToFileURL } from "node:url";

const cliModulePath = process.argv[2];
const cliVersion = process.argv[3];
assert(cliModulePath != null, "installed CLI module path is required");
assert(cliVersion != null, "installed CLI version is required");

const { runCli } = await import(pathToFileURL(cliModulePath).href);
const apiOrigin = "https://api.toughcrowd.dev";
const apiKey = "tc_package_smoke_secret";
const stdout = createOutput();
const stderr = createOutput();
const abortController = new AbortController();
const fetchCalls = [];

const exitCode = await runCli(
  [
    "session",
    "list",
    "--status",
    "running",
    "--repo",
    "acme/web",
    "--limit",
    "1",
    "--cursor",
    "opaque-cursor",
    "--json",
  ],
  {
    stdout,
    stderr,
    version: cliVersion,
    signal: abortController.signal,
    env: {
      TOUGHCROWD_API_ORIGIN: apiOrigin,
      TOUGHCROWD_API_KEY: apiKey,
    },
    credentialStore: {
      async read() {
        throw new Error("environment authentication must not read keyring");
      },
      async write() {
        throw new Error("session list must not write keyring");
      },
    },
    async fetch(url, init) {
      const headers = new Headers(init.headers);
      fetchCalls.push({
        url: String(url),
        method: init.method,
        authorization: headers.get("authorization"),
        client: headers.get("x-toughcrowd-client"),
      });

      return jsonResponse({
        sessions: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Package smoke session",
            status: "running",
            repository: {
              fullName: "acme/web",
              serverOnly: "discarded",
            },
            createdAt: "2026-07-18T20:01:02.000Z",
            initialPrompt: "not part of the CLI JSON contract",
          },
        ],
        counts: {
          all: 1,
          queued: 0,
          initializing: 0,
          running: 1,
          ready: 0,
          failed: 0,
          cancelled: 0,
          merged: 0,
          abandoned: 0,
          archived: 0,
        },
        pageInfo: {
          nextCursor: null,
          hasMore: false,
        },
      });
    },
  },
);

assert(exitCode === 0, "installed session list returned the wrong exit code");
assert(stderr.value === "", "installed session list wrote diagnostics");
assert(fetchCalls.length === 1, "installed session list made extra requests");
assert(
  JSON.stringify(fetchCalls[0]) ===
    JSON.stringify({
      url:
        apiOrigin +
        "/api/sessions?status=running&repository=acme%2Fweb&limit=1&cursor=opaque-cursor",
      method: "GET",
      authorization: "Bearer " + apiKey,
      client: "@toughcrowd/cli/" + cliVersion,
    }),
  "installed session list sent the wrong request",
);
assert(
  stdout.value ===
    '{"sessions":[{"id":"11111111-1111-4111-8111-111111111111","title":"Package smoke session","status":"running","repository":{"fullName":"acme/web"},"createdAt":"2026-07-18T20:01:02.000Z"}],"counts":{"all":1,"queued":0,"initializing":0,"running":1,"ready":0,"failed":0,"cancelled":0,"merged":0,"abandoned":0,"archived":0},"pageInfo":{"nextCursor":null,"hasMore":false}}\n',
  "installed session list returned the wrong JSON document",
);
assert(
  !stdout.value.includes("initialPrompt") &&
    !stdout.value.includes("serverOnly") &&
    !stdout.value.includes(apiKey) &&
    !stderr.value.includes(apiKey),
  "installed session list exposed discarded or secret values",
);

process.stdout.write("Verified installed session list\n");

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
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
