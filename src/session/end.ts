import { ApiClientError } from "../api/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { AuthCommandError } from "../auth/errors.js";
import { endSession, type SessionEndAction } from "./api.js";
import { SessionCommandError } from "./errors.js";
import { printHumanSessionAction, printJsonSessionAction } from "./output.js";
import {
  resolveAuthenticatedSessionApiRuntime,
  type SessionRuntime,
} from "./runtime.js";

export interface EndSessionRuntime extends SessionRuntime {
  createIdempotencyKey(): string;
}

export interface EndSessionCommandOptions {
  action: SessionEndAction;
  sessionId: string;
  json?: boolean;
}

export async function end(
  runtime: EndSessionRuntime,
  options: EndSessionCommandOptions,
): Promise<void> {
  try {
    const apiRuntime = await resolveAuthenticatedSessionApiRuntime(runtime);
    const idempotencyKey = readIdempotencyKey(
      runtime.createIdempotencyKey(),
      options.action,
    );
    const result = await endSession({
      ...apiRuntime,
      action: options.action,
      sessionId: options.sessionId,
      idempotencyKey,
    });

    if (options.json === true) {
      printJsonSessionAction(runtime.stdout, result);
    } else {
      printHumanSessionAction(runtime.stdout, result, options.action);
    }
  } catch (error) {
    throw formatEndFailure(error, options.action);
  }
}

function readIdempotencyKey(value: string, action: SessionEndAction): string {
  const key = value.trim();
  if (key.length === 0 || key.length > 200) {
    throw new SessionCommandError(
      `Could not ${action} session: failed to generate an idempotency key.`,
    );
  }
  return key;
}

function formatEndFailure(error: unknown, action: SessionEndAction): Error {
  if (
    error instanceof SessionCommandError ||
    error instanceof AuthCommandError
  ) {
    return error;
  }

  const operation = action === "cancel" ? "cancel" : "abandon";
  const operationNoun = action === "cancel" ? "cancellation" : "abandonment";
  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new SessionCommandError(
        `Session ${operationNoun} request canceled.`,
        130,
      );
    }
    if (error.kind === "timeout") {
      return new SessionCommandError(
        `Could not ${operation} session: the API request timed out.`,
      );
    }
    if (error.kind === "network") {
      return new SessionCommandError(
        `Could not ${operation} session: could not reach the Tough Crowd API.`,
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
    if (error.status != null && error.status >= 500) {
      return new SessionCommandError(
        `Could not ${operation} session: the Tough Crowd API returned an internal error.`,
      );
    }
    if (error.kind === "api") {
      return new SessionCommandError(
        `Could not ${operation} session: ${error.message}`,
      );
    }
  }

  return new SessionCommandError(
    `Could not ${operation} session: the Tough Crowd API returned an invalid response.`,
  );
}
