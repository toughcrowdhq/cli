import { Command } from "commander";
import {
  reportDeploymentCommand,
  type ReportDeploymentRuntime,
} from "./commands.js";

export function createDeployCommandGroup(
  runtime: ReportDeploymentRuntime,
): Command {
  return new Command("deploy")
    .description("Report Tough Crowd deployments")
    .addCommand(createReportCommand(runtime));
}

function createReportCommand(runtime: ReportDeploymentRuntime): Command {
  return new Command("report")
    .description("Report a production deployment from GitHub Actions")
    .option("--json", "print machine-readable JSON")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (options: { json?: boolean }) => {
      await reportDeploymentCommand(runtime, { json: options.json === true });
    });
}
