#!/usr/bin/env node

import { runCli } from "./cli.js";
import { readPackageVersion } from "./version.js";

const abortController = new AbortController();
const abort = (): void => {
  abortController.abort();
};

process.once("SIGINT", abort);
process.once("SIGTERM", abort);

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    version: readPackageVersion(),
    signal: abortController.signal,
    env: process.env,
    stdin: process.stdin,
  });
} finally {
  process.off("SIGINT", abort);
  process.off("SIGTERM", abort);
}
