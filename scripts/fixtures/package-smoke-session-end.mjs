import { pathToFileURL } from "node:url";

const cliModulePath = process.argv[2];
const cliVersion = process.argv[3];
assert(cliModulePath != null, "installed CLI module path is required");
assert(cliVersion != null, "installed CLI version is required");

const { runCli } = await import(pathToFileURL(cliModulePath).href);
const apiOrigin = "https://api.toughcrowd.dev";
const apiKey = "tc_package_end_secret";
const sessionId = "44444444-4444-4444-8444-444444444444";
const fetchCalls = [];

for (const action of ["cancel", "abandon"]) {
  const stdout = createOutput();
  const stderr = createOutput();
  const status = action === "cancel" ? "cancelling" : "abandoned";
  const exitCode = await runCli(["session", action, sessionId, "--json"], {
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
        throw new Error("session lifecycle commands must not write keyring");
      },
    },
    async fetch(url, init) {
      const headers = new Headers(init.headers);
      fetchCalls.push({
        url: String(url),
        method: init.method,
        authorization: headers.get("authorization"),
        client: headers.get("x-toughcrowd-client"),
        body: init.body,
      });
      return jsonResponse({
        session: { id: sessionId, status, initialPrompt: "server-only" },
      });
    },
  });

  assert(
    exitCode === 0,
    `installed session ${action} returned the wrong exit code`,
  );
  assert(stderr.value === "", `installed session ${action} wrote diagnostics`);
  assert(
    stdout.value === `{"session":{"id":"${sessionId}","status":"${status}"}}\n`,
    `installed session ${action} returned the wrong JSON document`,
  );
  assert(
    !stdout.value.includes("initialPrompt") &&
      !stdout.value.includes(apiKey) &&
      !stderr.value.includes(apiKey),
    `installed session ${action} exposed discarded or secret values`,
  );
}

assert(
  fetchCalls.length === 2,
  "installed session end made the wrong number of requests",
);
assert(
  JSON.stringify(fetchCalls) ===
    JSON.stringify(
      ["cancel", "abandon"].map((action) => ({
        url: `${apiOrigin}/api/sessions/${sessionId}/${action}`,
        method: "POST",
        authorization: `Bearer ${apiKey}`,
        client: `@toughcrowd/cli/${cliVersion}`,
      })),
    ),
  "installed session end sent the wrong requests",
);

process.stdout.write("Verified installed session end\n");

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
