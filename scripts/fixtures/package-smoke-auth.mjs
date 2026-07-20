import { pathToFileURL } from "node:url";

const cliModulePath = process.argv[2];
const cliVersion = process.argv[3];
assert(cliModulePath != null, "installed CLI module path is required");
assert(cliVersion != null, "installed CLI version is required");

const { runCli } = await import(pathToFileURL(cliModulePath).href);
const apiOrigin = "https://api.toughcrowd.dev";
const authorizationUrl =
  "https://app.toughcrowd.dev/cli/authorize?request=package-smoke";
const callbackUri = "http://127.0.0.1:43123/callback";
const state = "s".repeat(43);
const codeVerifier = "v".repeat(43);
const codeChallenge = "c".repeat(43);
const authorizationCode = "package-smoke-code";
const apiKey = `tc_key_${"A".repeat(22)}_${"B".repeat(43)}`;
const stdout = createOutput();
const stderr = createOutput();
const abortController = new AbortController();
const fetchCalls = [];
const credentialWrites = [];
let openedUrl;
let listenerCloseCount = 0;

const exitCode = await runCli(["auth", "login"], {
  stdout,
  stderr,
  version: cliVersion,
  signal: abortController.signal,
  env: { TOUGHCROWD_API_ORIGIN: apiOrigin },
  createAuthorizationSecrets() {
    return { state, codeVerifier, codeChallenge };
  },
  async bindLoopbackListener(options) {
    assert(
      options.state === state,
      "login bound a listener with the wrong state",
    );
    assert(
      options.signal === abortController.signal,
      "login bound a listener with the wrong abort signal",
    );

    return {
      callbackUri,
      async waitForCallback() {
        return { kind: "approved", code: authorizationCode };
      },
      async close() {
        listenerCloseCount += 1;
      },
    };
  },
  async openUrl(url) {
    openedUrl = url;
    return true;
  },
  credentialStore: {
    async read() {
      throw new Error("browser login must not read the existing credential");
    },
    async write(origin, key) {
      credentialWrites.push({ origin, key });
    },
  },
  async fetch(url, init) {
    const requestUrl = String(url);
    const body = typeof init.body === "string" ? init.body : "";
    fetchCalls.push({
      url: requestUrl,
      method: init.method,
      authorization: new Headers(init.headers).get("authorization"),
      body,
    });

    if (requestUrl === `${apiOrigin}/api/cli-authorizations`) {
      return jsonResponse({
        authorizationUrl,
        expiresAt: "2026-07-18T22:00:00.000Z",
      });
    }

    if (requestUrl === `${apiOrigin}/api/cli-authorizations/exchange`) {
      return jsonResponse({
        key: apiKey,
        apiKey: {
          id: "11111111-1111-4111-8111-111111111111",
          name: `Tough Crowd CLI ${cliVersion}`,
          createdAt: "2026-07-18T21:00:00.000Z",
        },
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Package Smoke",
          email: "package-smoke@example.com",
        },
      });
    }

    throw new Error(`unexpected package-smoke request: ${requestUrl}`);
  },
});

assert(exitCode === 0, "installed browser login returned the wrong exit code");
assert(
  openedUrl === authorizationUrl,
  "installed browser login opened the wrong URL",
);
assert(
  listenerCloseCount === 1,
  "installed browser login did not close its listener once",
);
assert(
  JSON.stringify(credentialWrites) ===
    JSON.stringify([{ origin: apiOrigin, key: apiKey }]),
  "installed browser login wrote the wrong credential",
);
assert(
  fetchCalls.length === 2,
  "installed browser login made unexpected API requests",
);
assert(
  JSON.stringify(fetchCalls[0]) ===
    JSON.stringify({
      url: `${apiOrigin}/api/cli-authorizations`,
      method: "POST",
      authorization: null,
      body: JSON.stringify({
        callbackUri,
        codeChallenge,
        codeChallengeMethod: "S256",
        state,
        clientName: `Tough Crowd CLI ${cliVersion}`,
      }),
    }),
  "installed browser login sent the wrong authorization-start request",
);
assert(
  JSON.stringify(fetchCalls[1]) ===
    JSON.stringify({
      url: `${apiOrigin}/api/cli-authorizations/exchange`,
      method: "POST",
      authorization: null,
      body: JSON.stringify({ code: authorizationCode, codeVerifier }),
    }),
  "installed browser login sent the wrong authorization-exchange request",
);
assert(
  stdout.value ===
    `Authorize Tough Crowd CLI: ${authorizationUrl}\n` +
      "Authenticated as package-smoke@example.com\n" +
      `API origin: ${apiOrigin}\n` +
      "Credential source: stored\n" +
      `API key: Tough Crowd CLI ${cliVersion}\n`,
  "installed browser login returned the wrong output",
);
assert(
  stderr.value === "",
  "installed browser login wrote unexpected diagnostics",
);
for (const secret of [state, codeVerifier, authorizationCode, apiKey]) {
  assert(
    !stdout.value.includes(secret) && !stderr.value.includes(secret),
    "installed browser login exposed authorization material",
  );
}

process.stdout.write("Verified installed browser login\n");

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
