import { requestJson, type RequestJsonOptions } from "../api/request.js";
import {
  decodeDeploymentReportResponse,
  type DeploymentReportResponse,
} from "./types.js";

export interface ReportDeploymentOptions {
  apiOrigin: string;
  authorization: string;
  repository: string;
  commitSha: string;
  source: {
    provider: "github_actions";
    runId: string;
    runAttempt: string;
    workflowRunUrl: string;
  };
  idempotencyKey: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<DeploymentReportResponse>["fetch"];
  timers?: RequestJsonOptions<DeploymentReportResponse>["timers"];
}

export function reportDeployment(
  options: ReportDeploymentOptions,
): Promise<DeploymentReportResponse> {
  return requestJson({
    origin: options.apiOrigin,
    method: "POST",
    path: "/api/deployments",
    authorization: options.authorization,
    idempotencyKey: options.idempotencyKey,
    body: {
      repository: { fullName: options.repository },
      commitSha: options.commitSha,
      githubActionsRunId: options.source.runId,
      githubActionsRunAttempt: Number.parseInt(options.source.runAttempt, 10),
      workflowRunUrl: options.source.workflowRunUrl,
    },
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeDeploymentReportResponse,
  });
}
