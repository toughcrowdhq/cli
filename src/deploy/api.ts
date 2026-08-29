import { requestJson, type RequestJsonOptions } from "../api/request.js";
import {
  decodeDeploymentRecordResponse,
  type DeploymentRecordResponse,
} from "./types.js";

export interface RecordDeploymentOptions {
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
  fetch?: RequestJsonOptions<DeploymentRecordResponse>["fetch"];
  timers?: RequestJsonOptions<DeploymentRecordResponse>["timers"];
}

export function recordDeployment(
  options: RecordDeploymentOptions,
): Promise<DeploymentRecordResponse> {
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
    decode: decodeDeploymentRecordResponse,
  });
}
