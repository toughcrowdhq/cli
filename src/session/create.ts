import { ApiClientError } from "../api/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { AuthCommandError } from "../auth/errors.js";
import { createSession } from "./api.js";
import { SessionCommandError } from "./errors.js";
import {
  resolveCreateSessionInputs,
  type CreationEnvironment,
} from "./inputs.js";
import { printHumanCreatedSession, printJsonCreatedSession } from "./output.js";
import {
  resolveAuthenticatedSessionApiRuntime,
  type SessionRuntime,
} from "./runtime.js";

export interface CreateSessionRuntime extends SessionRuntime {
  env?: SessionRuntime["env"] & CreationEnvironment;
  readGitOrigin(): Promise<string | null>;
  createIdempotencyKey(): string;
}

export interface CreateSessionCommandOptions {
  prompt: string;
  repo?: string;
  profile?: string;
  baseBranch?: string;
  title?: string;
  json?: boolean;
}

export async function create(
  runtime: CreateSessionRuntime,
  options: CreateSessionCommandOptions,
): Promise<void> {
  try {
    const inputs = await resolveCreateSessionInputs({
      prompt: options.prompt,
      repo: options.repo,
      profile: options.profile,
      baseBranch: options.baseBranch,
      title: options.title,
      env: runtime.env,
      readGitOrigin: () => runtime.readGitOrigin(),
    });
    const apiRuntime = await resolveAuthenticatedSessionApiRuntime(runtime);
    const idempotencyKey = readIdempotencyKey(runtime.createIdempotencyKey());
    const result = await createSession({
      ...apiRuntime,
      idempotencyKey,
      prompt: inputs.prompt,
      repository: inputs.repository.value,
      agentProfile: inputs.agentProfile?.value,
      baseBranch: inputs.baseBranch,
      title: inputs.title,
    });

    if (options.json === true) {
      printJsonCreatedSession(runtime.stdout, result);
    } else {
      printHumanCreatedSession(runtime.stdout, result.session);
    }
  } catch (error) {
    throw formatCreateFailure(error);
  }
}

function readIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length === 0 || key.length > 200) {
    throw new SessionCommandError(
      "Could not create session: failed to generate an idempotency key.",
    );
  }
  return key;
}

function formatCreateFailure(error: unknown): Error {
  if (
    error instanceof SessionCommandError ||
    error instanceof AuthCommandError
  ) {
    return error;
  }

  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new SessionCommandError("Session creation canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new SessionCommandError(
        "Could not create session: the API request timed out.",
      );
    }
    if (error.kind === "network") {
      return new SessionCommandError(
        "Could not create session: could not reach the Tough Crowd API.",
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 401 || error.code === "authentication-required")
    ) {
      return new SessionCommandError(
        `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 404 || error.code === "not-found")
    ) {
      return new SessionCommandError(
        "Could not create session: repository is not available. Check --repo and your GitHub connection.",
      );
    }
    if (error.status != null && error.status >= 500) {
      return new SessionCommandError(
        "Could not create session: the Tough Crowd API returned an internal error.",
      );
    }
    if (error.kind === "api") {
      return new SessionCommandError(
        `Could not create session: ${error.message}`,
      );
    }
  }

  return new SessionCommandError(
    "Could not create session: the Tough Crowd API returned an invalid response.",
  );
}
