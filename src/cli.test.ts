import { describe, expect, it } from "vitest";
import { runCli, type CliRuntime } from "./cli.js";

const rootHelp = `Usage: toughcrowd [options]

The command-line client for Tough Crowd

Options:
  -V, --version  output the version number
  -h, --help     display help for command
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
    expect(runtime.stderr.output).toBe(
      "error: too many arguments. Expected 0 arguments but got 1: extra.\n",
    );
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
});

interface CapturedWritable {
  output: string;
  write(value: string): void;
}

function createRuntime(
  overrides: Partial<Pick<CliRuntime, "version" | "signal">> = {},
): CliRuntime & { stdout: CapturedWritable; stderr: CapturedWritable } {
  return {
    stdout: createWritable(),
    stderr: createWritable(),
    version: overrides.version ?? "0.0.0-test",
    signal: overrides.signal ?? new AbortController().signal,
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
