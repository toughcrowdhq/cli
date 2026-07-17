import { Command, CommanderError } from "commander";

export interface CliWritable {
  write(value: string): unknown;
}

export interface CliRuntime {
  stdout: CliWritable;
  stderr: CliWritable;
  version: string;
  signal: AbortSignal;
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

    if (isUnknownRootCommand(args)) {
      runtime.stderr.write(`error: unknown command '${args[0]}'\n`);
      return usageErrorExitCode;
    }

    await program.parseAsync([...args], { from: "user" });

    return interrupted ? interruptedExitCode : 0;
  } catch (error) {
    if (interrupted) return interruptedExitCode;

    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : usageErrorExitCode;
    }

    runtime.stderr.write(`${formatUnexpectedError(error)}\n`);
    return unexpectedFailureExitCode;
  } finally {
    runtime.signal.removeEventListener("abort", markInterrupted);
  }
}

function isUnknownRootCommand(args: readonly string[]): boolean {
  const [firstArg] = args;

  return firstArg != null && firstArg !== "--" && !firstArg.startsWith("-");
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

  return program;
}

function formatUnexpectedError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Unexpected error: ${error.message}`;
  }

  return "Unexpected error";
}
