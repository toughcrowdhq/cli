import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const executable = process.argv[2];
const cliVersion = process.argv[3];
assert(executable != null, "installed executable path is required");
assert(cliVersion != null, "installed CLI version is required");

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteBody = "😀".repeat(65_536);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "toughcrowd-note-"));
const notePath = join(temporaryDirectory, "incident-report.md");
let receivedBody;

const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    assert(
      request.method === "POST" &&
        request.url === `/api/incidents/${incidentId}/notes`,
      "installed CLI used the wrong incident-note endpoint",
    );
    receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8")).body;
    response.writeHead(201, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        note: {
          id: "22222222-2222-4222-8222-222222222222",
          incidentId,
          body: "Stored",
          createdAt: "2026-09-05T12:00:00.000Z",
          updatedAt: "2026-09-05T12:00:00.000Z",
          createdBy: null,
          updatedBy: null,
        },
      }),
    );
  });
});

try {
  await writeFile(notePath, noteBody, "utf8");
  const address = await listen(server);
  const result = await run(
    executable,
    ["incident", "note", incidentId, "--body-file", notePath, "--json"],
    {
      ...process.env,
      TOUGHCROWD_API_ORIGIN: `http://127.0.0.1:${address.port}`,
      TOUGHCROWD_API_KEY: "tc_package_note_secret",
    },
  );

  assert(result.exitCode === 0, `installed CLI failed: ${result.stderr}`);
  assert(result.stderr === "", "installed CLI wrote unexpected diagnostics");
  assert(
    result.stdout.includes('"body":"Stored"'),
    "installed CLI returned the wrong incident-note response",
  );
  assert(
    receivedBody === noteBody,
    "installed CLI did not send the full 256 KiB note body",
  );
} finally {
  await close(server);
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Verified installed 256 KiB incident note\n");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error == null ? resolve() : reject(error)));
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
