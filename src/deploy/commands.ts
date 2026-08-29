import { ApiClientError } from "../api/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { AuthCommandError } from "../auth/errors.js";
import { reportDeployment } from "./api.js";
import { DeployCommandError } from "./errors.js";
import {
  resolveDeploymentReportInputs,
  type GitHubActionsDeploymentEnvironment,
} from "./inputs.js";
import {
  printHumanDeploymentReport,
  printJsonDeploymentReport,
} from "./output.js";
import {
  resolveAuthenticatedDeployApiRuntime,
  type DeployRuntime,
} from "./runtime.js";

export interface ReportDeploymentRuntime extends DeployRuntime {
  env?: DeployRuntime["env"] & GitHubActionsDeploymentEnvironment;
}

export interface ReportDeploymentCommandOptions {
  json?: boolean;
}

export async function reportDeploymentCommand(
  runtime: ReportDeploymentRuntime,
  options: ReportDeploymentCommandOptions,
): Promise<void> {
  try {
    const inputs = resolveDeploymentReportInputs(runtime.env);
    const apiRuntime = await resolveAuthenticatedDeployApiRuntime(runtime);
    const result = await reportDeployment({
      ...apiRuntime,
      repository: inputs.repository,
      commitSha: inputs.commitSha,
      source: inputs.source,
      idempotencyKey: inputs.idempotencyKey,
    });

    if (options.json === true) {
      printJsonDeploymentReport(runtime.stdout, result);
    } else {
      printHumanDeploymentReport(runtime.stdout, result);
    }
  } catch (error) {
    throw formatDeploymentFailure(error);
  }
}

function formatDeploymentFailure(error: unknown): Error {
  if (
    error instanceof DeployCommandError ||
    error instanceof AuthCommandError
  ) {
    return error;
  }
  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new DeployCommandError("Deployment reporting canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new DeployCommandError(
        "Could not report deployment: the API request timed out.",
      );
    }
    if (error.kind === "network") {
      return new DeployCommandError(
        "Could not report deployment: could not reach the Tough Crowd API.",
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 401 || error.code === "authentication-required")
    ) {
      return new DeployCommandError(
        `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
      );
    }
    if (error.status != null && error.status >= 500) {
      return new DeployCommandError(
        "Could not report deployment: the Tough Crowd API returned an internal error.",
      );
    }
    if (error.kind === "api") {
      return new DeployCommandError(
        `Could not report deployment: ${error.message}`,
      );
    }
  }
  return new DeployCommandError(
    "Could not report deployment: the Tough Crowd API returned an invalid response.",
  );
}
