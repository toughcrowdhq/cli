import { ApiClientError } from "../api/errors.js";
import { AuthCommandError } from "../auth/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { listSessions, type ListSessionsRequest } from "./api.js";
import { SessionCommandError } from "./errors.js";
import { printHumanSessionList, printJsonSessionList } from "./output.js";
import {
  resolveAuthenticatedSessionApiRuntime,
  type SessionRuntime,
} from "./runtime.js";

export interface ListSessionCommandOptions extends ListSessionsRequest {
  json?: boolean;
}

export async function list(
  runtime: SessionRuntime,
  options: ListSessionCommandOptions = {},
): Promise<void> {
  try {
    const apiRuntime = await resolveAuthenticatedSessionApiRuntime(runtime);
    const result = await listSessions({
      ...apiRuntime,
      status: options.status,
      repo: options.repo,
      limit: options.limit,
      cursor: options.cursor,
    });

    if (options.json === true) {
      printJsonSessionList(runtime.stdout, result);
    } else {
      printHumanSessionList(runtime.stdout, result);
    }
  } catch (error) {
    throw formatListFailure(error);
  }
}

function formatListFailure(error: unknown): Error {
  if (
    error instanceof SessionCommandError ||
    error instanceof AuthCommandError
  ) {
    return error;
  }

  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new SessionCommandError("Session list canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new SessionCommandError(
        "Could not list sessions: the API request timed out.",
      );
    }
    if (error.kind === "network") {
      return new SessionCommandError(
        "Could not list sessions: could not reach the Tough Crowd API.",
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
    if (error.kind === "api") {
      return new SessionCommandError(
        `Could not list sessions: ${error.message}`,
      );
    }
    if (error.status != null && error.status >= 500) {
      return new SessionCommandError(
        "Could not list sessions: the Tough Crowd API returned an internal error.",
      );
    }
  }

  return new SessionCommandError(
    "Could not list sessions: the Tough Crowd API returned an invalid response.",
  );
}
