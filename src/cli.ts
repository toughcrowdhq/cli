import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander";
import { randomUUID } from "node:crypto";
import { ApiClientError } from "./api/errors.js";
import { openUrl as defaultOpenUrl } from "./browser.js";
import { login, status, type AuthRuntime } from "./auth/commands.js";
import type { FetchLike, TimerCapabilities } from "./api/request.js";
import {
  createKeyringCredentialStore,
  type CredentialStore,
} from "./auth/credentials.js";
import { AuthCommandError } from "./auth/errors.js";
import {
  bindLoopbackListener,
  type LoopbackListenerFactory,
} from "./auth/loopback.js";
import {
  createAuthorizationSecrets,
  type AuthorizationSecrets,
} from "./auth/pkce.js";
import { readGitOriginUrl } from "./git.js";
import { createDeployCommandGroup } from "./deploy/cli.js";
import { DeployCommandError } from "./deploy/errors.js";
import { createIssueCommandGroup } from "./issue/cli.js";
import { IssueCommandError } from "./issue/errors.js";
import { create, type CreateSessionCommandOptions } from "./session/create.js";
import { list, type ListSessionCommandOptions } from "./session/list.js";
import { SessionCommandError } from "./session/errors.js";
import { end } from "./session/end.js";
import { isSessionId, sessionStatusFilters } from "./session/types.js";
import {
  resolveAuthenticatedSessionApiRuntime,
  type SessionRuntime,
} from "./session/runtime.js";
import {
  ConfigError,
  configPath,
  getConfigValue,
  parseConfigKey,
  readConfig,
  setConfigValue,
  unsetConfigValue,
  writeConfig,
  type ConfigKey,
} from "./config.js";
import { listAgentProfiles, validateSelection } from "./agent-profile.js";

export interface CliWritable {
  write(value: string): unknown;
}

export interface CliRuntime {
  stdout: CliWritable;
  stderr: CliWritable;
  version: string;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  credentialStore?: CredentialStore;
  createAuthorizationSecrets?(): AuthorizationSecrets;
  bindLoopbackListener?: LoopbackListenerFactory;
  openUrl?(url: string): Promise<boolean>;
  readGitOrigin?(): Promise<string | null>;
  createIdempotencyKey?(): string;
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

    if (error instanceof SessionCommandError) {
      runtime.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    if (error instanceof IssueCommandError) {
      runtime.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    if (error instanceof DeployCommandError) {
      runtime.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    if (error instanceof ConfigError) {
      runtime.stderr.write(`${error.message}\n`);
      return 1;
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

  program.addCommand(createConfigCommand(runtime));
  program.addCommand(createAgentProfileCommand(runtime));

  program
    .command("session")
    .description("Work with Tough Crowd sessions")
    .addCommand(createSessionListCommand(runtime))
    .addCommand(createSessionNewCommand(runtime))
    .addCommand(createSessionEndCommand(runtime, "cancel"))
    .addCommand(createSessionEndCommand(runtime, "abandon"));

  program.addCommand(
    configureCommandTree(
      createIssueCommandGroup({
        ...createSessionRuntime(runtime),
        createIdempotencyKey: () =>
          runtime.createIdempotencyKey != null
            ? runtime.createIdempotencyKey()
            : randomUUID(),
      }),
      runtime,
    ),
  );

  program.addCommand(
    configureCommandTree(
      createDeployCommandGroup(createSessionRuntime(runtime)),
      runtime,
    ),
  );

  return program;
}

function createSessionListCommand(runtime: CliRuntime): Command {
  const command = new Command("list")
    .description("List sessions visible to the authenticated user")
    .addOption(
      new Option("--status <status>", "filter by session status").choices([
        ...sessionStatusFilters,
      ]),
    )
    .option("--repo <owner/name>", "filter by repository")
    .option("--limit <count>", "maximum sessions to return", parseListLimit)
    .option("--cursor <cursor>", "continue from an opaque page cursor")
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (options: ListSessionCommandOptions) => {
      await list(createSessionRuntime(runtime), {
        status: options.status,
        repo: options.repo,
        limit: options.limit,
        cursor: options.cursor,
        json: options.json === true,
      });
    });

  return configureNestedCommand(command, runtime);
}

function createSessionNewCommand(runtime: CliRuntime): Command {
  const command = new Command("new")
    .description("Create a new coding-agent session")
    .argument("<prompt>", "initial instruction for the coding agent")
    .option("--repo <owner/name>", "repository for the session")
    .option("--profile <profile-id>", "Agent Profile to use")
    .option("--model <model>", "model to use with the Agent Profile")
    .option(
      "--reasoning-effort <effort>",
      "reasoning effort to use with the model",
    )
    .addOption(
      new Option(
        "--no-defaults",
        "bypass environment and stored session defaults",
      ).conflicts(["profile", "model", "reasoningEffort"]),
    )
    .option("--base-branch <branch>", "base branch for generated changes")
    .option("--title <title>", "session title")
    .option(
      "--issue-id <issue-id>",
      "relate the new session to an issue",
      parseIssueId,
    )
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(
      async (
        prompt: string,
        options: Omit<CreateSessionCommandOptions, "prompt" | "noDefaults"> & {
          defaults?: boolean;
        },
      ) => {
        await create(
          {
            ...createSessionRuntime(runtime),
            readGitOrigin: () =>
              runtime.readGitOrigin != null
                ? runtime.readGitOrigin()
                : readGitOriginUrl({ signal: runtime.signal }),
            createIdempotencyKey: () =>
              runtime.createIdempotencyKey != null
                ? runtime.createIdempotencyKey()
                : randomUUID(),
          },
          {
            prompt,
            repo: options.repo,
            profile: options.profile,
            model: options.model,
            reasoningEffort: options.reasoningEffort,
            noDefaults: options.defaults === false,
            baseBranch: options.baseBranch,
            title: options.title,
            issueId: options.issueId,
            json: options.json === true,
          },
        );
      },
    );

  return configureNestedCommand(command, runtime);
}

function createSessionEndCommand(
  runtime: CliRuntime,
  action: "cancel" | "abandon",
): Command {
  const command = new Command(action)
    .description(
      action === "cancel"
        ? "Cancel an active session"
        : "Abandon an unshipped session",
    )
    .argument("<session-id>", "session ID", parseSessionId)
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (sessionId: string, options: { json?: boolean }) => {
      await end(createSessionRuntime(runtime), {
        action,
        sessionId,
        json: options.json === true,
      });
    });

  return configureNestedCommand(command, runtime);
}

function configureNestedCommand(
  command: Command,
  runtime: CliRuntime,
): Command {
  command.exitOverride().configureOutput({
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

  return command;
}

function configureCommandTree(command: Command, runtime: CliRuntime): Command {
  configureNestedCommand(command, runtime);
  for (const child of command.commands) configureCommandTree(child, runtime);
  return command;
}

function createSessionRuntime(runtime: CliRuntime): SessionRuntime {
  return {
    stdout: runtime.stdout,
    version: runtime.version,
    signal: runtime.signal,
    env: runtime.env,
    fetch: runtime.fetch,
    timers: runtime.timers,
    credentialStore: runtime.credentialStore ?? createKeyringCredentialStore(),
  };
}

function createConfigCommand(runtime: CliRuntime): Command {
  const command = new Command("config").description(
    "Manage machine-local Tough Crowd preferences",
  );
  command.addCommand(
    new Command("path")
      .description("Print the effective configuration path")
      .action(() => {
        runtime.stdout.write(`${configPath(runtime.env)}\n`);
      }),
  );
  command.addCommand(
    new Command("list")
      .description("List configured preferences")
      .option("--json", "print machine-readable JSON")
      .action(async (options: { json?: boolean }) => {
        const config = await readConfig(runtime.env);
        if (options.json === true) {
          runtime.stdout.write(`${JSON.stringify(config)}\n`);
          return;
        }
        for (const key of configKeys) {
          const value = getConfigValue(config, key);
          if (value != null) runtime.stdout.write(`${key}=${value}\n`);
        }
      }),
  );
  command.addCommand(
    new Command("unset")
      .description("Remove a configured preference")
      .argument("<key>", "configuration key")
      .action(async (key: string) => {
        const config = unsetConfigValue(
          await readConfig(runtime.env),
          parseConfigKey(key),
        );
        await writeConfig(config, runtime.env);
      }),
  );
  command.addCommand(
    new Command("set")
      .description("Set a machine-local session preference")
      .argument("<key>", "configuration key")
      .argument("<value>", "configuration value")
      .action(async (key: string, value: string) => {
        const configKey = parseConfigKey(key);
        const config = setConfigValue(
          await readConfig(runtime.env),
          configKey,
          value,
        );
        const apiRuntime = await resolveAuthenticatedSessionApiRuntime(
          createSessionRuntime(runtime),
        );
        try {
          const catalog = await listAgentProfiles(apiRuntime);
          validateSelection(catalog, {
            profile: config.session?.agentProfile,
            model: config.session?.model,
            reasoningEffort: config.session?.reasoningEffort,
          });
        } catch (error) {
          throw new SessionCommandError(formatConfigSetFailure(error));
        }
        await writeConfig(config, runtime.env);
      }),
  );
  return configureCommandTree(command, runtime);
}

export function formatConfigSetFailure(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return "Configuration update canceled.";
    }
    if (error.kind === "timeout") {
      return "Could not set configuration: the API request timed out.";
    }
    if (error.kind === "network") {
      return "Could not set configuration: could not reach the Tough Crowd API.";
    }
    if (error.kind === "malformed-response") {
      return "Could not set configuration: the Tough Crowd API returned an invalid response.";
    }
    if (error.status != null && error.status >= 500) {
      return "Could not set configuration: the Tough Crowd API returned an internal error.";
    }
    if (error.status === 401 || error.code === "authentication-required") {
      return `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set TOUGHCROWD_API_KEY.`;
    }
    return `Could not set configuration: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Could not set configuration: ${error.message}`;
  }
  return "Could not set configuration: the Agent Profile catalog is invalid.";
}

const configKeys: readonly ConfigKey[] = [
  "session.profile",
  "session.model",
  "session.reasoning-effort",
];

function createAgentProfileCommand(runtime: CliRuntime): Command {
  const command = new Command("agent-profile").description(
    "Discover executable Agent Profiles",
  );
  command.addCommand(
    new Command("list")
      .description("List available Agent Profiles")
      .option("--json", "print machine-readable JSON")
      .action(async (options: { json?: boolean }) => {
        let profiles;
        try {
          profiles = await listAgentProfiles(
            await resolveAuthenticatedSessionApiRuntime(
              createSessionRuntime(runtime),
            ),
          );
        } catch (error) {
          if (error instanceof SessionCommandError) {
            throw error;
          }
          throw formatAgentProfileListFailure(error);
        }
        if (options.json === true) {
          runtime.stdout.write(`${JSON.stringify(profiles)}\n`);
          return;
        }
        if (profiles.profiles.length === 0) {
          runtime.stdout.write("No Agent Profiles found.\n");
          return;
        }
        for (const profile of profiles.profiles) {
          runtime.stdout.write(
            `${profile.id}\t${profile.name}\t${profile.authenticationMode}\t${profile.defaultModel ?? "(server default)"}\n`,
          );
          for (const model of profile.models) {
            runtime.stdout.write(
              `  ${model.id}${model.reasoningEfforts.length === 0 ? "" : ` (${model.reasoningEfforts.join(", ")})`}\n`,
            );
          }
        }
      }),
  );
  return configureCommandTree(command, runtime);
}

export function formatAgentProfileListFailure(
  error: unknown,
): SessionCommandError {
  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new SessionCommandError("Agent Profile listing canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new SessionCommandError(
        "Could not list Agent Profiles: the API request timed out.",
      );
    }
    if (error.kind === "network") {
      return new SessionCommandError(
        "Could not list Agent Profiles: could not reach the Tough Crowd API.",
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 401 || error.code === "authentication-required")
    ) {
      return new SessionCommandError(
        `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set TOUGHCROWD_API_KEY.`,
      );
    }
    if (error.status != null && error.status >= 500) {
      return new SessionCommandError(
        "Could not list Agent Profiles: the Tough Crowd API returned an internal error.",
      );
    }
    if (error.kind === "api") {
      return new SessionCommandError(
        `Could not list Agent Profiles: ${error.message}`,
      );
    }
  }
  return new SessionCommandError(
    "Could not list Agent Profiles: the Tough Crowd API returned an invalid response.",
  );
}

function parseListLimit(value: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new InvalidArgumentError("must be an integer from 1 to 100");
  }

  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new InvalidArgumentError("must be an integer from 1 to 100");
  }

  return limit;
}

function parseSessionId(value: string): string {
  if (!isSessionId(value)) {
    throw new InvalidArgumentError("must be a UUID");
  }
  return value;
}

function parseIssueId(value: string): string {
  if (!isSessionId(value)) {
    throw new InvalidArgumentError("must be a UUID");
  }
  return value;
}

function createAuthLoginCommand(runtime: CliRuntime): Command {
  return new Command("login")
    .description("Authenticate through browser approval")
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
    timers: runtime.timers,
    credentialStore: runtime.credentialStore ?? createKeyringCredentialStore(),
    createAuthorizationSecrets: () =>
      runtime.createAuthorizationSecrets != null
        ? runtime.createAuthorizationSecrets()
        : createAuthorizationSecrets(),
    bindLoopbackListener: (options) =>
      runtime.bindLoopbackListener != null
        ? runtime.bindLoopbackListener(options)
        : bindLoopbackListener(options),
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
