import { ApiClientError } from "../api/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { AuthCommandError } from "../auth/errors.js";
import {
  createIncidentComponent,
  createIncident,
  createIncidentNote,
  deleteIncidentNote,
  getIncident,
  listIncidentComponents,
  listIncidentNotes,
  listIncidents,
  updateIncident,
  updateIncidentComponent,
  updateIncidentNote,
  type CreateIncidentComponentRequest,
  type CreateIncidentNoteRequest,
  type CreateIncidentRequest,
  type DeleteIncidentNoteRequest,
  type ListIncidentNotesRequest,
  type ListIncidentsRequest,
  type UpdateIncidentNoteRequest,
  type UpdateIncidentComponentRequest,
  type UpdateIncidentRequest,
} from "./api.js";
import { IncidentCommandError } from "./errors.js";
import {
  readComponentName,
  readOptionalComponentDescription,
  readOptionalComponentName,
  readOptionalImpacts,
  readOptionalNarrative,
  readOptionalNullableNarrative,
  readOptionalOperationalTimestamp,
  readOptionalRepository,
  readOptionalTitle,
  readRequiredIncidentNoteBody,
  resolveCreateIncidentInputs,
  type IncidentCreationEnvironment,
} from "./inputs.js";
import {
  printIncidentComponentList,
  printIncidentComponentResponse,
  printIncidentDetail,
  printIncidentList,
  printIncidentNoteResponse,
  printIncidentNoteDeletion,
  printIncidentResponse,
} from "./output.js";
import {
  resolveAuthenticatedIncidentApiRuntime,
  type IncidentRuntime,
} from "./runtime.js";

interface JsonOption {
  json?: boolean;
}

export type ListIncidentCommandOptions = ListIncidentsRequest & JsonOption;
export type CreateIncidentCommandOptions = CreateIncidentRequest & JsonOption;
export type GetIncidentCommandOptions = ListIncidentNotesRequest & JsonOption;
export type UpdateIncidentCommandOptions = UpdateIncidentRequest & JsonOption;
export type CreateIncidentNoteCommandOptions = CreateIncidentNoteRequest &
  JsonOption;
export type UpdateIncidentNoteCommandOptions = UpdateIncidentNoteRequest &
  JsonOption;
export type DeleteIncidentNoteCommandOptions = DeleteIncidentNoteRequest &
  JsonOption;
export type ListIncidentComponentsCommandOptions = JsonOption;
export type CreateIncidentComponentCommandOptions =
  CreateIncidentComponentRequest & JsonOption;
export type UpdateIncidentComponentCommandOptions =
  UpdateIncidentComponentRequest & JsonOption;

export interface CreateIncidentRuntime extends IncidentRuntime {
  env?: IncidentRuntime["env"] & IncidentCreationEnvironment;
  readGitOrigin(): Promise<string | null>;
}

export async function listIncidentCommand(
  runtime: IncidentRuntime,
  options: ListIncidentCommandOptions,
): Promise<void> {
  await runIncidentOperation("list incidents", runtime, async (apiRuntime) => {
    const result = await listIncidents({
      ...apiRuntime,
      ...options,
      repo: readOptionalRepository(options.repo),
    });
    printIncidentList(runtime.stdout, result, options.json === true);
  });
}

export async function createIncidentCommand(
  runtime: CreateIncidentRuntime,
  options: CreateIncidentCommandOptions,
): Promise<void> {
  const inputs = await resolveCreateIncidentInputs({
    summary: options.summary,
    title: options.title,
    repo: options.repo,
    resolutionSummary: options.resolutionSummary,
    env: runtime.env,
    readGitOrigin: () => runtime.readGitOrigin(),
  });

  await runIncidentOperation("create incident", runtime, async (apiRuntime) => {
    const result = await createIncident({
      ...apiRuntime,
      ...options,
      ...inputs,
      startedAt: readOptionalOperationalTimestamp(
        options.startedAt,
        "Started time",
      ),
      detectedAt: readOptionalOperationalTimestamp(
        options.detectedAt,
        "Detected time",
      ),
      mitigatedAt: readOptionalOperationalTimestamp(
        options.mitigatedAt,
        "Mitigated time",
      ),
      resolvedAt: readOptionalOperationalTimestamp(
        options.resolvedAt,
        "Resolved time",
      ),
      impacts: readOptionalImpacts(options.impacts),
    });
    printIncidentResponse(
      runtime.stdout,
      result,
      "created",
      options.json === true,
    );
  });
}

export async function getIncidentCommand(
  runtime: IncidentRuntime,
  options: GetIncidentCommandOptions,
): Promise<void> {
  await runIncidentOperation("get incident", runtime, async (apiRuntime) => {
    const [incident, notes] = await Promise.all([
      getIncident({ ...apiRuntime, incidentId: options.incidentId }),
      listIncidentNotes({
        ...apiRuntime,
        incidentId: options.incidentId,
        limit: options.limit,
        cursor: options.cursor,
      }),
    ]);
    printIncidentDetail(
      runtime.stdout,
      {
        incident: incident.incident,
        notes: notes.notes,
        nextCursor: notes.nextCursor,
      },
      options.json === true,
    );
  });
}

export async function updateIncidentCommand(
  runtime: IncidentRuntime,
  options: UpdateIncidentCommandOptions,
): Promise<void> {
  await runIncidentOperation("update incident", runtime, async (apiRuntime) => {
    const result = await updateIncident({
      ...apiRuntime,
      incidentId: options.incidentId,
      repo: readOptionalRepository(options.repo),
      title: readOptionalTitle(options.title),
      summary: readOptionalNarrative(options.summary, "Summary"),
      severity: options.severity,
      state: options.state,
      resolutionSummary: readOptionalNullableNarrative(
        options.resolutionSummary,
        "Resolution summary",
      ),
      startedAt: readOptionalOperationalTimestamp(
        options.startedAt,
        "Started time",
      ),
      detectedAt: readOptionalOperationalTimestamp(
        options.detectedAt,
        "Detected time",
      ),
      mitigatedAt: readOptionalOperationalTimestamp(
        options.mitigatedAt,
        "Mitigated time",
      ),
      resolvedAt: readOptionalOperationalTimestamp(
        options.resolvedAt,
        "Resolved time",
      ),
      impacts: readOptionalImpacts(options.impacts),
    });
    printIncidentResponse(
      runtime.stdout,
      result,
      "updated",
      options.json === true,
    );
  });
}

export async function listIncidentComponentsCommand(
  runtime: IncidentRuntime,
  options: ListIncidentComponentsCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "list incident components",
    runtime,
    async (apiRuntime) => {
      const result = await listIncidentComponents(apiRuntime);
      printIncidentComponentList(runtime.stdout, result, options.json === true);
    },
  );
}

export async function createIncidentComponentCommand(
  runtime: IncidentRuntime,
  options: CreateIncidentComponentCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "create incident component",
    runtime,
    async (apiRuntime) => {
      const result = await createIncidentComponent({
        ...apiRuntime,
        name: readComponentName(options.name),
        description: readOptionalComponentDescription(options.description),
      });
      printIncidentComponentResponse(
        runtime.stdout,
        result,
        "created",
        options.json === true,
      );
    },
  );
}

export async function updateIncidentComponentCommand(
  runtime: IncidentRuntime,
  options: UpdateIncidentComponentCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "update incident component",
    runtime,
    async (apiRuntime) => {
      const result = await updateIncidentComponent({
        ...apiRuntime,
        componentId: options.componentId,
        name: readOptionalComponentName(options.name),
        description: readOptionalComponentDescription(options.description),
        archived: options.archived,
      });
      printIncidentComponentResponse(
        runtime.stdout,
        result,
        "updated",
        options.json === true,
      );
    },
  );
}

export async function createIncidentNoteCommand(
  runtime: IncidentRuntime,
  options: CreateIncidentNoteCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "create incident note",
    runtime,
    async (apiRuntime) => {
      const result = await createIncidentNote({
        ...apiRuntime,
        incidentId: options.incidentId,
        body: readRequiredIncidentNoteBody(options.body),
      });
      printIncidentNoteResponse(
        runtime.stdout,
        result,
        "created",
        options.json === true,
      );
    },
  );
}

export async function updateIncidentNoteCommand(
  runtime: IncidentRuntime,
  options: UpdateIncidentNoteCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "update incident note",
    runtime,
    async (apiRuntime) => {
      const result = await updateIncidentNote({
        ...apiRuntime,
        incidentId: options.incidentId,
        noteId: options.noteId,
        body: readRequiredIncidentNoteBody(options.body),
      });
      printIncidentNoteResponse(
        runtime.stdout,
        result,
        "updated",
        options.json === true,
      );
    },
  );
}

export async function deleteIncidentNoteCommand(
  runtime: IncidentRuntime,
  options: DeleteIncidentNoteCommandOptions,
): Promise<void> {
  await runIncidentOperation(
    "delete incident note",
    runtime,
    async (apiRuntime) => {
      await deleteIncidentNote({
        ...apiRuntime,
        incidentId: options.incidentId,
        noteId: options.noteId,
      });
      printIncidentNoteDeletion(
        runtime.stdout,
        options.incidentId,
        options.noteId,
        options.json === true,
      );
    },
  );
}

async function runIncidentOperation(
  operation: string,
  runtime: IncidentRuntime,
  execute: (
    apiRuntime: Awaited<
      ReturnType<typeof resolveAuthenticatedIncidentApiRuntime>
    >,
  ) => Promise<void>,
): Promise<void> {
  try {
    const apiRuntime = await resolveAuthenticatedIncidentApiRuntime(runtime);
    await execute(apiRuntime);
  } catch (error) {
    throw formatIncidentFailure(operation, error);
  }
}

function formatIncidentFailure(operation: string, error: unknown): Error {
  if (
    error instanceof IncidentCommandError ||
    error instanceof AuthCommandError
  ) {
    return error;
  }

  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new IncidentCommandError(`Could not ${operation}: canceled.`, 130);
    }
    if (error.kind === "timeout") {
      return new IncidentCommandError(
        `Could not ${operation}: the API request timed out.`,
      );
    }
    if (error.kind === "network") {
      return new IncidentCommandError(
        `Could not ${operation}: could not reach the Tough Crowd API.`,
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 401 || error.code === "authentication-required")
    ) {
      return new IncidentCommandError(
        `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
      );
    }
    if (error.kind === "api") {
      return new IncidentCommandError(
        `Could not ${operation}: ${error.message}`,
      );
    }
  }

  return new IncidentCommandError(
    `Could not ${operation}: the Tough Crowd API returned an invalid response.`,
  );
}
