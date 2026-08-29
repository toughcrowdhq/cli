import type { DeploymentReportResponse } from "./types.js";

export function printHumanDeploymentReport(
  stdout: { write(value: string): unknown },
  result: DeploymentReportResponse,
): void {
  stdout.write("Deployment reported\n");
  stdout.write(`Repository: ${result.deployment.repository.fullName}\n`);
  stdout.write(`SHA: ${result.deployment.commitSha}\n`);
  stdout.write(`Reconciliation: ${result.reconciliation.state}\n`);
}

export function printJsonDeploymentReport(
  stdout: { write(value: string): unknown },
  result: DeploymentReportResponse,
): void {
  stdout.write(`${JSON.stringify(result)}\n`);
}
