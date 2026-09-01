import { Command, InvalidArgumentError, Option } from "commander";
import {
  createIncidentCommand,
  createIncidentNoteCommand,
  getIncidentCommand,
  listIncidentCommand,
  updateIncidentCommand,
  updateIncidentNoteCommand,
  type CreateIncidentRuntime,
} from "./commands.js";
import {
  incidentSeverities,
  incidentStates,
  isIncidentId,
  type IncidentSeverity,
  type IncidentState,
} from "./types.js";
import { readCursor } from "./inputs.js";

export function createIncidentCommandGroup(
  runtime: CreateIncidentRuntime,
): Command {
  return new Command("incident")
    .description("Work with Tough Crowd incidents")
    .addCommand(createCreateCommand(runtime))
    .addCommand(createListCommand(runtime))
    .addCommand(createGetCommand(runtime))
    .addCommand(createUpdateCommand(runtime))
    .addCommand(createNoteCommand(runtime));
}

function createCreateCommand(runtime: CreateIncidentRuntime): Command {
  return command("create", "Create an incident")
    .argument("<summary>", "incident summary")
    .requiredOption("--title <title>", "incident title")
    .option("--repo <owner/name>", "repository for the incident")
    .addOption(
      new Option("--severity <severity>", "incident severity").choices([
        ...incidentSeverities,
      ]),
    )
    .addOption(
      new Option("--state <state>", "incident lifecycle state").choices([
        ...incidentStates,
      ]),
    )
    .option("--resolution-summary <text>", "resolution summary")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        summary: string,
        options: {
          title: string;
          repo?: string;
          severity?: IncidentSeverity;
          state?: IncidentState;
          resolutionSummary?: string;
          json?: boolean;
        },
      ) => {
        await createIncidentCommand(runtime, {
          summary,
          title: options.title,
          repo: options.repo,
          severity: options.severity,
          state: options.state,
          resolutionSummary: options.resolutionSummary,
          json: options.json === true,
        });
      },
    );
}

function createListCommand(runtime: CreateIncidentRuntime): Command {
  return command("list", "List incidents")
    .addOption(
      new Option("--state <state>", "filter by lifecycle state").choices([
        ...incidentStates,
      ]),
    )
    .addOption(
      new Option("--severity <severity>", "filter by severity").choices([
        ...incidentSeverities,
      ]),
    )
    .option("--repo <owner/name>", "filter by exact repository")
    .option("--limit <count>", "maximum incidents to return", parsePageLimit)
    .option(
      "--cursor <cursor>",
      "continue from an opaque page cursor",
      readCursor,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (options: {
        state?: IncidentState;
        severity?: IncidentSeverity;
        repo?: string;
        limit?: number;
        cursor?: string;
        json?: boolean;
      }) => {
        await listIncidentCommand(runtime, {
          state: options.state,
          severity: options.severity,
          repo: options.repo,
          limit: options.limit,
          cursor: options.cursor,
          json: options.json === true,
        });
      },
    );
}

function createGetCommand(runtime: CreateIncidentRuntime): Command {
  return command("get", "Show incident detail")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .option("--limit <count>", "maximum notes to return", parsePageLimit)
    .option(
      "--cursor <cursor>",
      "continue from an opaque note cursor",
      readCursor,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        options: { limit?: number; cursor?: string; json?: boolean },
      ) => {
        await getIncidentCommand(runtime, {
          incidentId,
          limit: options.limit,
          cursor: options.cursor,
          json: options.json === true,
        });
      },
    );
}

function createUpdateCommand(runtime: CreateIncidentRuntime): Command {
  const updateCommand = command("update", "Update an incident")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .option("--repo <owner/name>", "new repository")
    .option("--title <title>", "new incident title")
    .option("--summary <summary>", "new incident summary")
    .addOption(
      new Option("--severity <severity>", "new incident severity").choices([
        ...incidentSeverities,
      ]),
    )
    .addOption(
      new Option("--state <state>", "new lifecycle state").choices([
        ...incidentStates,
      ]),
    )
    .option("--resolution-summary <text>", "new resolution summary")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        options: {
          repo?: string;
          title?: string;
          summary?: string;
          severity?: IncidentSeverity;
          state?: IncidentState;
          resolutionSummary?: string;
          json?: boolean;
        },
      ) => {
        if (
          options.repo == null &&
          options.title == null &&
          options.summary == null &&
          options.severity == null &&
          options.state == null &&
          options.resolutionSummary == null
        ) {
          updateCommand.error(
            "error: at least one of --repo, --title, --summary, --severity, --state, or --resolution-summary is required",
          );
        }
        await updateIncidentCommand(runtime, {
          incidentId,
          repo: options.repo,
          title: options.title,
          summary: options.summary,
          severity: options.severity,
          state: options.state,
          resolutionSummary: options.resolutionSummary,
          json: options.json === true,
        });
      },
    );
  return updateCommand;
}

function createNoteCommand(runtime: CreateIncidentRuntime): Command {
  return command("note", "Add or edit incident notes")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .argument("<body>", "note body")
    .option("--json", "print machine-readable JSON")
    .action(
      async (incidentId: string, body: string, options: { json?: boolean }) => {
        await createIncidentNoteCommand(runtime, {
          incidentId,
          body,
          json: options.json === true,
        });
      },
    )
    .addCommand(createNoteUpdateCommand(runtime));
}

function createNoteUpdateCommand(runtime: CreateIncidentRuntime): Command {
  return command("update", "Edit an incident note")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .argument("<note-id>", "note ID", parseIncidentId)
    .argument("<body>", "note body")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        noteId: string,
        body: string,
        options: { json?: boolean },
      ) => {
        await updateIncidentNoteCommand(runtime, {
          incidentId,
          noteId,
          body,
          json: options.json === true,
        });
      },
    );
}

function command(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .allowExcessArguments(false)
    .allowUnknownOption(false);
}

function parsePageLimit(value: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new InvalidArgumentError("must be an integer from 1 to 100");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new InvalidArgumentError("must be an integer from 1 to 100");
  }
  return limit;
}

function parseIncidentId(value: string): string {
  if (!isIncidentId(value)) {
    throw new InvalidArgumentError("must be a UUID");
  }
  return value;
}
