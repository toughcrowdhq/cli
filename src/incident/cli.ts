import { Command, InvalidArgumentError, Option } from "commander";
import {
  createIncidentComponentCommand,
  createIncidentCommand,
  createIncidentNoteCommand,
  deleteIncidentNoteCommand,
  getIncidentCommand,
  listIncidentComponentsCommand,
  listIncidentCommand,
  updateIncidentComponentCommand,
  updateIncidentCommand,
  updateIncidentNoteCommand,
  type CreateIncidentRuntime,
} from "./commands.js";
import {
  incidentImpactConditions,
  incidentSeverities,
  incidentStates,
  isIncidentId,
  type IncidentImpactInput,
  type IncidentSeverity,
  type IncidentState,
} from "./types.js";
import { readCursor, readIncidentNoteBodyFile } from "./inputs.js";

export function createIncidentCommandGroup(
  runtime: CreateIncidentRuntime,
): Command {
  return new Command("incident")
    .description("Work with Tough Crowd incidents")
    .addCommand(createCreateCommand(runtime))
    .addCommand(createListCommand(runtime))
    .addCommand(createGetCommand(runtime))
    .addCommand(createUpdateCommand(runtime))
    .addCommand(createComponentCommand(runtime))
    .addCommand(createNoteCommand(runtime));
}

function createCreateCommand(runtime: CreateIncidentRuntime): Command {
  const createCommand = command("create", "Create an incident")
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
    .option(
      "--started-at <timestamp>",
      "when impact started (ISO 8601 with offset)",
    )
    .option("--clear-started-at", "record no known start time")
    .option("--detected-at <timestamp>", "when the incident was detected")
    .option("--clear-detected-at", "record no known detection time")
    .option("--mitigated-at <timestamp>", "when impact was mitigated")
    .option("--clear-mitigated-at", "record no known mitigation time")
    .option("--resolved-at <timestamp>", "when the incident was resolved")
    .option("--clear-resolved-at", "record no known resolution time")
    .option(
      "--impacts <json>",
      "incident impacts as a JSON array",
      parseIncidentImpacts,
    )
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
          startedAt?: string;
          clearStartedAt?: boolean;
          detectedAt?: string;
          clearDetectedAt?: boolean;
          mitigatedAt?: string;
          clearMitigatedAt?: boolean;
          resolvedAt?: string;
          clearResolvedAt?: boolean;
          impacts?: IncidentImpactInput[];
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
          startedAt: resolveNullableOption(
            createCommand,
            "--started-at",
            options.startedAt,
            options.clearStartedAt,
          ),
          detectedAt: resolveNullableOption(
            createCommand,
            "--detected-at",
            options.detectedAt,
            options.clearDetectedAt,
          ),
          mitigatedAt: resolveNullableOption(
            createCommand,
            "--mitigated-at",
            options.mitigatedAt,
            options.clearMitigatedAt,
          ),
          resolvedAt: resolveNullableOption(
            createCommand,
            "--resolved-at",
            options.resolvedAt,
            options.clearResolvedAt,
          ),
          impacts: options.impacts,
          json: options.json === true,
        });
      },
    );
  return createCommand;
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
    .option("--clear-resolution-summary", "clear the resolution summary")
    .option("--started-at <timestamp>", "new impact start time")
    .option("--clear-started-at", "clear the impact start time")
    .option("--detected-at <timestamp>", "new detection time")
    .option("--clear-detected-at", "clear the detection time")
    .option("--mitigated-at <timestamp>", "new mitigation time")
    .option("--clear-mitigated-at", "clear the mitigation time")
    .option("--resolved-at <timestamp>", "new resolution time")
    .option("--clear-resolved-at", "clear the resolution time")
    .option(
      "--impacts <json>",
      "replace impacts with a JSON array",
      parseIncidentImpacts,
    )
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
          clearResolutionSummary?: boolean;
          startedAt?: string;
          clearStartedAt?: boolean;
          detectedAt?: string;
          clearDetectedAt?: boolean;
          mitigatedAt?: string;
          clearMitigatedAt?: boolean;
          resolvedAt?: string;
          clearResolvedAt?: boolean;
          impacts?: IncidentImpactInput[];
          json?: boolean;
        },
      ) => {
        if (
          options.repo == null &&
          options.title == null &&
          options.summary == null &&
          options.severity == null &&
          options.state == null &&
          options.resolutionSummary == null &&
          options.clearResolutionSummary !== true &&
          options.startedAt == null &&
          options.clearStartedAt !== true &&
          options.detectedAt == null &&
          options.clearDetectedAt !== true &&
          options.mitigatedAt == null &&
          options.clearMitigatedAt !== true &&
          options.resolvedAt == null &&
          options.clearResolvedAt !== true &&
          options.impacts == null
        ) {
          updateCommand.error("error: at least one incident field is required");
        }
        await updateIncidentCommand(runtime, {
          incidentId,
          repo: options.repo,
          title: options.title,
          summary: options.summary,
          severity: options.severity,
          state: options.state,
          resolutionSummary: resolveNullableOption(
            updateCommand,
            "--resolution-summary",
            options.resolutionSummary,
            options.clearResolutionSummary,
          ),
          startedAt: resolveNullableOption(
            updateCommand,
            "--started-at",
            options.startedAt,
            options.clearStartedAt,
          ),
          detectedAt: resolveNullableOption(
            updateCommand,
            "--detected-at",
            options.detectedAt,
            options.clearDetectedAt,
          ),
          mitigatedAt: resolveNullableOption(
            updateCommand,
            "--mitigated-at",
            options.mitigatedAt,
            options.clearMitigatedAt,
          ),
          resolvedAt: resolveNullableOption(
            updateCommand,
            "--resolved-at",
            options.resolvedAt,
            options.clearResolvedAt,
          ),
          impacts: options.impacts,
          json: options.json === true,
        });
      },
    );
  return updateCommand;
}

function createComponentCommand(runtime: CreateIncidentRuntime): Command {
  return command("component", "Manage incident components")
    .addCommand(
      command("list", "List incident components")
        .option("--json", "print machine-readable JSON")
        .action(async (options: { json?: boolean }) => {
          await listIncidentComponentsCommand(runtime, {
            json: options.json === true,
          });
        }),
    )
    .addCommand(
      command("create", "Create an incident component")
        .argument("<name>", "component name")
        .option("--description <text>", "component description")
        .option("--json", "print machine-readable JSON")
        .action(
          async (
            name: string,
            options: { description?: string; json?: boolean },
          ) => {
            await createIncidentComponentCommand(runtime, {
              name,
              description: options.description,
              json: options.json === true,
            });
          },
        ),
    )
    .addCommand(createComponentUpdateCommand(runtime));
}

function createComponentUpdateCommand(runtime: CreateIncidentRuntime): Command {
  const updateCommand = command("update", "Update an incident component")
    .argument("<component-id>", "component ID", parseIncidentId)
    .option("--name <name>", "new component name")
    .option("--description <text>", "new component description")
    .option("--clear-description", "clear the component description")
    .option("--archive", "archive the component")
    .option("--unarchive", "unarchive the component")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        componentId: string,
        options: {
          name?: string;
          description?: string;
          clearDescription?: boolean;
          archive?: boolean;
          unarchive?: boolean;
          json?: boolean;
        },
      ) => {
        if (
          options.name == null &&
          options.description == null &&
          options.clearDescription !== true &&
          options.archive !== true &&
          options.unarchive !== true
        ) {
          updateCommand.error(
            "error: at least one component field is required",
          );
        }
        if (options.archive === true && options.unarchive === true) {
          updateCommand.error(
            "error: --archive and --unarchive cannot be combined",
          );
        }
        await updateIncidentComponentCommand(runtime, {
          componentId,
          name: options.name,
          description: resolveNullableOption(
            updateCommand,
            "--description",
            options.description,
            options.clearDescription,
          ),
          archived:
            options.archive === true
              ? true
              : options.unarchive === true
                ? false
                : undefined,
          json: options.json === true,
        });
      },
    );
  return updateCommand;
}

function createNoteCommand(runtime: CreateIncidentRuntime): Command {
  const noteCommand = command("note", "Add, edit, or delete incident notes")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .argument("[body]", "note body")
    .option("--body-file <path>", "read note body from a UTF-8 file")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        body: string | undefined,
        options: { bodyFile?: string; json?: boolean },
      ) => {
        await createIncidentNoteCommand(runtime, {
          incidentId,
          body: await resolveNoteBody(noteCommand, body, options.bodyFile),
          json: options.json === true,
        });
      },
    )
    .addCommand(createNoteUpdateCommand(runtime))
    .addCommand(createNoteDeleteCommand(runtime));
  return noteCommand;
}

function createNoteUpdateCommand(runtime: CreateIncidentRuntime): Command {
  const updateCommand = command("update", "Edit an incident note")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .argument("<note-id>", "note ID", parseIncidentId)
    .argument("[body]", "note body")
    .option("--body-file <path>", "read note body from a UTF-8 file")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        noteId: string,
        body: string | undefined,
        options: { bodyFile?: string; json?: boolean },
        actionCommand: Command,
      ) => {
        await updateIncidentNoteCommand(runtime, {
          incidentId,
          noteId,
          body: await resolveNoteBody(
            updateCommand,
            body,
            options.bodyFile ??
              actionCommand.parent?.opts<{ bodyFile?: string }>().bodyFile,
          ),
          json:
            options.json === true ||
            actionCommand.parent?.opts<{ json?: boolean }>().json === true,
        });
      },
    );
  return updateCommand;
}

function createNoteDeleteCommand(runtime: CreateIncidentRuntime): Command {
  return command("delete", "Delete an incident note")
    .argument("<incident-id>", "incident ID", parseIncidentId)
    .argument("<note-id>", "note ID", parseIncidentId)
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        incidentId: string,
        noteId: string,
        options: { json?: boolean },
        actionCommand: Command,
      ) => {
        await deleteIncidentNoteCommand(runtime, {
          incidentId,
          noteId,
          json:
            options.json === true ||
            actionCommand.parent?.opts<{ json?: boolean }>().json === true,
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

async function resolveNoteBody(
  optionCommand: Command,
  body: string | undefined,
  bodyFile: string | undefined,
): Promise<string> {
  if (body !== undefined && bodyFile !== undefined) {
    optionCommand.error("error: <body> and --body-file cannot be combined");
  }
  if (body === undefined && bodyFile === undefined) {
    optionCommand.error(
      "error: either <body> or --body-file <path> is required",
    );
  }
  return bodyFile === undefined ? body! : readIncidentNoteBodyFile(bodyFile);
}

function resolveNullableOption(
  optionCommand: Command,
  optionName: string,
  value: string | undefined,
  clear: boolean | undefined,
): string | null | undefined {
  if (value !== undefined && clear === true) {
    optionCommand.error(
      `error: ${optionName} and --clear-${optionName.slice(2)} cannot be combined`,
    );
  }
  return clear === true ? null : value;
}

function parseIncidentImpacts(value: string): IncidentImpactInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InvalidArgumentError("must be a JSON array of incident impacts");
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidArgumentError("must be a JSON array of incident impacts");
  }
  return parsed.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new InvalidArgumentError(
        "must be a JSON array of incident impacts",
      );
    }
    const record = entry as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => key !== "componentId" && key !== "condition",
      ) ||
      typeof record.condition !== "string" ||
      !incidentImpactConditions.includes(
        record.condition as IncidentImpactInput["condition"],
      ) ||
      !(
        record.componentId === undefined ||
        record.componentId === null ||
        typeof record.componentId === "string"
      )
    ) {
      throw new InvalidArgumentError(
        "must be a JSON array of incident impacts",
      );
    }
    return {
      ...(record.componentId === undefined
        ? {}
        : { componentId: record.componentId }),
      condition: record.condition as IncidentImpactInput["condition"],
    };
  });
}
