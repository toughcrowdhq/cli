import { Command } from "commander";
import {
  recordDeploymentCommand,
  type RecordDeploymentRuntime,
} from "./commands.js";

export function createDeployCommandGroup(
  runtime: RecordDeploymentRuntime,
): Command {
  return new Command("deploy")
    .description("Record Tough Crowd deployments")
    .addCommand(createRecordCommand(runtime));
}

function createRecordCommand(runtime: RecordDeploymentRuntime): Command {
  return new Command("record")
    .description("Record a production deployment from GitHub Actions")
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (options: { json?: boolean }) => {
      await recordDeploymentCommand(runtime, { json: options.json === true });
    });
}
