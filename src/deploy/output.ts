import type { DeploymentRecordResponse } from "./types.js";

export function printHumanDeploymentRecord(
  stdout: { write(value: string): unknown },
  result: DeploymentRecordResponse,
): void {
  stdout.write("Deployment recorded\n");
  stdout.write(`Repository: ${result.deployment.repository.fullName}\n`);
  stdout.write(`SHA: ${result.deployment.commitSha}\n`);
  stdout.write(
    `Sessions newly marked Deployed: ${result.associatedSessions.count}\n`,
  );
}

export function printJsonDeploymentRecord(
  stdout: { write(value: string): unknown },
  result: DeploymentRecordResponse,
): void {
  stdout.write(`${JSON.stringify(result)}\n`);
}
