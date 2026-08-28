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
      repository: options.repository,
      commitSha: options.commitSha,
      environment: "production",
      source: options.source,
    },
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeDeploymentRecordResponse,
  });
}
