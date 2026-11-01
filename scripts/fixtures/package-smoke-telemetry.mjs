import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

const entry = process.argv[2];
assert(entry, "installed binary entry is required");
let reports = [];
let hangTelemetry = false;
let onBusiness = () => {};
let onTerminal = () => {};
const server = createServer((request, response) => {
  let text = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    text += chunk;
  });
  request.on("end", () => {
    if (request.url === "/api/client-logs") {
      const envelope = JSON.parse(text);
      assert.equal(envelope.source, "cli-client");
      assert.equal(envelope.entries.length, 1);
      reports.push({
        event: envelope.entries[0],
        authorization: request.headers.authorization,
      });
      if (envelope.entries[0].event === "cli.command.finished") onTerminal();
      if (!hangTelemetry) {
        response.writeHead(202, { "content-type": "application/json" });
        response.end('{"accepted":1}');
      }
    } else if (request.url === "/api/sessions") {
      onBusiness(); // Keep the command in flight until a real process signal.
    } else if (request.url === "/api/cli-authorizations") {
      response.writeHead(503, {
        "content-type": "application/json",
        "x-request-id": "smoke-login-failure",
      });
      response.end(
        '{"error":{"code":"unavailable","message":"server-canary"}}',
      );
    } else {
      response.writeHead(404);
      response.end();
    }
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
function run(args, extraEnv = {}) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: {
      ...process.env,
      TOUGHCROWD_API_ORIGIN: origin,
      TOUGHCROWD_API_KEY: "",
      TOUGHCROWD_TELEMETRY: "1",
      DO_NOT_TRACK: "0",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 6000);
  const completed = once(child, "close").then(([code, signal]) => {
    clearTimeout(timeout);
    assert.equal(signal, null, "CLI exceeded the process deadline");
    return { code, stdout, stderr };
  });
  return { child, completed };
}
try {
  let result = await run(["config", "path"]).completed;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const configPathOutput = result.stdout;
  assert.deepEqual(
    reports.map(({ event }) => [event.event, event.command, event.outcome]),
    [
      ["cli.command.started", "config path", undefined],
      ["cli.command.finished", "config path", "success"],
    ],
  );
  assert(reports.every((report) => report.authorization === undefined));
  assert.equal(reports[0].event.invocationId, reports[1].event.invocationId);
  reports = [];
  result = await run(["session", "new"]).completed;
  assert.equal(result.code, 2);
  assert.equal(result.stderr, "error: missing required argument 'prompt'\n");
  assert.equal(reports[1].event.error.kind, "usage");
  reports = [];
  result = await run(["auth", "login"]).completed;
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Authentication failed: server-canary\n");
  assert.equal(reports[1].event.api.requestId, "smoke-login-failure");
  assert(reports.every((report) => report.authorization === undefined));
  assert(!JSON.stringify(reports).includes("server-canary"));
  reports = [];
  hangTelemetry = true;
  const before = performance.now();
  result = await run(["config", "path"]).completed;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert(
    performance.now() - before < 2000,
    "hung telemetry delayed process exit",
  );
  assert.equal(reports.length, 2);
  server.closeAllConnections();
  hangTelemetry = false;
  if (process.platform !== "win32") {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      for (const scenario of [
        {
          args: ["config", "path"],
          code: 0,
          outcome: "success",
          stdout: configPathOutput,
          stderr: "",
        },
        {
          args: ["session", "new"],
          code: 2,
          outcome: "failure",
          stdout: "",
          stderr: "error: missing required argument 'prompt'\n",
        },
      ]) {
        reports = [];
        hangTelemetry = true;
        const finalizing = new Promise((resolve) => {
          onTerminal = resolve;
        });
        const { child, completed } = run(scenario.args);
        // Observe the terminal POST before signaling: the command result is
        // committed and only the deliberately stalled delivery is still running.
        await finalizing;
        const terminal = reports.find(
          ({ event }) => event.event === "cli.command.finished",
        ).event;
        assert.equal(terminal.outcome, scenario.outcome);
        assert.equal(terminal.exitCode, scenario.code);
        const interruptedAt = performance.now();
        child.kill(signal);
        result = await completed;
        assert.deepEqual(result, {
          code: scenario.code,
          stdout: scenario.stdout,
          stderr: scenario.stderr,
        });
        assert.equal(terminal.exitCode, result.code);
        assert.equal(terminal.outcome, scenario.outcome);
        assert(
          performance.now() - interruptedAt < 1000,
          "signal did not interrupt telemetry finalization promptly",
        );
        assert.equal(reports.length, 2);
        server.closeAllConnections();
        hangTelemetry = false;
        onTerminal = () => {};
      }
    }
    for (const signal of ["SIGINT", "SIGTERM"]) {
      reports = [];
      const business = new Promise((resolve) => {
        onBusiness = resolve;
      });
      const { child, completed } = run(["session", "list"], {
        TOUGHCROWD_API_KEY: "smoke-canary",
      });
      await business;
      assert(
        !reports.some(({ event }) => event.event === "cli.command.finished"),
      );
      child.kill(signal);
      result = await completed;
      assert.deepEqual(result, { code: 130, stdout: "", stderr: "" });
      assert.equal(reports.length, 2);
      assert.equal(reports[1].event.outcome, "canceled");
      assert.equal(reports[1].event.exitCode, 130);
      assert(!("error" in reports[1].event));
      assert(!("api" in reports[1].event));
      assert(
        !JSON.stringify(reports.map(({ event }) => event)).includes(
          "smoke-canary",
        ),
      );
      server.closeAllConnections();
    }
  }
  reports = [];
  result = await run(["config", "path"], { TOUGHCROWD_TELEMETRY: "0" })
    .completed;
  assert.equal(result.code, 0);
  assert.equal(reports.length, 0);
  console.log(
    "Verified installed telemetry lifecycle, deadlines, and cancellation",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
