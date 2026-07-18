import { Command, CommanderError } from "commander";
import { openUrl as defaultOpenUrl } from "./browser.js";
import { login, status, type AuthRuntime } from "./auth/commands.js";
import type { FetchLike } from "./api/request.js";
import {
  createKeyringCredentialStore,
  type CredentialStore,
} from "./auth/credentials.js";
import { AuthCommandError } from "./auth/errors.js";
import { createTerminalPrompt, type HiddenPrompt } from "./auth/prompt.js";

export interface CliWritable {
  write(value: string): unknown;
}

export interface CliRuntime {
  stdout: CliWritable;
  stderr: CliWritable;
  version: string;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadStream;
  fetch?: FetchLike;
  credentialStore?: CredentialStore;
  prompt?: HiddenPrompt;
  openUrl?(url: string): Promise<boolean>;
}

const interruptedExitCode = 130;
const unexpectedFailureExitCode = 1;
const usageErrorExitCode = 2;

export async function runCli(
  args: readonly string[],
  runtime: CliRuntime,
): Promise<number> {
  let interrupted = runtime.signal.aborted;
  const markInterrupted = (): void => {
    interrupted = true;
  };

  runtime.signal.addEventListener("abort", markInterrupted, { once: true });

  try {
    if (interrupted) return interruptedExitCode;

    const program = createRootProgram(runtime);

    if (args.length === 0) {
      program.outputHelp();
      return interrupted ? interruptedExitCode : 0;
    }

    await program.parseAsync([...args], { from: "user" });

    return interrupted ? interruptedExitCode : 0;
  } catch (error) {
    if (interrupted) return interruptedExitCode;

    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : usageErrorExitCode;
    }

    if (error instanceof AuthCommandError) {
      runtime.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    runtime.stderr.write(`${formatUnexpectedError(error)}\n`);
    return unexpectedFailureExitCode;
  } finally {
    runtime.signal.removeEventListener("abort", markInterrupted);
  }
}

function createRootProgram(runtime: CliRuntime): Command {
  const program = new Command();

  program
    .name("toughcrowd")
    .description("The command-line client for Tough Crowd")
    .version(runtime.version)
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .exitOverride()
    .configureOutput({
      writeOut: (value) => {
        runtime.stdout.write(value);
      },
      writeErr: (value) => {
        runtime.stderr.write(value);
      },
      outputError: (value, write) => {
        write(value);
      },
    });

  program
    .command("auth")
    .description("Manage Tough Crowd authentication")
    .addCommand(createAuthLoginCommand(runtime))
    .addCommand(createAuthStatusCommand(runtime));

  return program;
}

function createAuthLoginCommand(runtime: CliRuntime): Command {
  return new Command("login")
    .description("Authenticate with a Tough Crowd API key")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async () => {
      await login(createAuthRuntime(runtime));
    });
}

function createAuthStatusCommand(runtime: CliRuntime): Command {
  return new Command("status")
    .description("Show the active Tough Crowd authentication status")
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (options: { json?: boolean }) => {
      await status(createAuthRuntime(runtime), { json: options.json === true });
    });
}

function createAuthRuntime(runtime: CliRuntime): AuthRuntime {
  return {
    stdout: runtime.stdout,
    stderr: runtime.stderr,
    version: runtime.version,
    signal: runtime.signal,
    env: runtime.env,
    fetch: runtime.fetch,
    credentialStore: runtime.credentialStore ?? createKeyringCredentialStore(),
    prompt:
      runtime.prompt ??
      createTerminalPrompt(runtime.stdin ?? process.stdin, runtime.stderr),
    openUrl: (url) =>
      runtime.openUrl != null ? runtime.openUrl(url) : defaultOpenUrl(url),
  };
}

function formatUnexpectedError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Unexpected error: ${error.message}`;
  }

  return "Unexpected error";
}
