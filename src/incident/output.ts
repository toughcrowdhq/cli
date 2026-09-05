import type {
  Incident,
  IncidentComponent,
  IncidentComponentList,
  IncidentComponentResponse,
  IncidentDetail,
  IncidentList,
  IncidentNote,
  IncidentNoteResponse,
  IncidentResponse,
} from "./types.js";

type Writable = { write(value: string): unknown };

const columnWidths = {
  id: 36,
  state: 9,
  severity: 12,
  repository: 28,
  title: 44,
  updatedAt: 24,
} as const;

const componentColumnWidths = {
  id: 36,
  status: 8,
  name: 28,
  description: 48,
} as const;

export function printIncidentList(
  stdout: Writable,
  result: IncidentList,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  if (result.incidents.length === 0) {
    stdout.write("No incidents found.\n");
    return;
  }
  stdout.write(
    formatRow({
      id: "ID",
      state: "STATE",
      severity: "SEVERITY",
      repository: "REPOSITORY",
      title: "TITLE",
      updatedAt: "UPDATED",
    }),
  );
  for (const incident of result.incidents) {
    stdout.write(formatIncidentRow(incident));
  }
  if (result.nextCursor != null) {
    stdout.write(`Next cursor: ${formatTerminalValue(result.nextCursor)}\n`);
  }
}

export function printIncidentResponse(
  stdout: Writable,
  result: IncidentResponse,
  action: "created" | "updated",
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Incident ${action}\n`);
  printIncidentFields(stdout, result.incident);
}

export function printIncidentDetail(
  stdout: Writable,
  detail: IncidentDetail,
  json: boolean,
): void {
  if (json) return printJson(stdout, detail);
  printIncidentFields(stdout, detail.incident);
  stdout.write(`Notes: ${detail.notes.length}\n`);
  for (const note of detail.notes) printIncidentNote(stdout, note);
  if (detail.nextCursor != null) {
    stdout.write(`Next cursor: ${formatTerminalValue(detail.nextCursor)}\n`);
  }
}

export function printIncidentNoteResponse(
  stdout: Writable,
  result: IncidentNoteResponse,
  action: "created" | "updated",
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Incident note ${action}\n`);
  printIncidentNote(stdout, result.note);
}

export function printIncidentNoteDeletion(
  stdout: Writable,
  incidentId: string,
  noteId: string,
  json: boolean,
): void {
  if (json) return printJson(stdout, { incidentId, noteId, deleted: true });
  stdout.write("Incident note deleted\n");
  stdout.write(`Incident ID: ${incidentId}\n`);
  stdout.write(`Note ID: ${noteId}\n`);
}

export function printIncidentComponentList(
  stdout: Writable,
  result: IncidentComponentList,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  if (result.components.length === 0) {
    stdout.write("No incident components found.\n");
    return;
  }
  stdout.write(
    formatComponentRow({
      id: "ID",
      status: "STATUS",
      name: "NAME",
      description: "DESCRIPTION",
    }),
  );
  for (const component of result.components) {
    stdout.write(
      formatComponentRow({
        id: component.id,
        status: component.archivedAt === null ? "active" : "archived",
        name: component.name,
        description: component.description ?? "(none)",
      }),
    );
  }
}

export function printIncidentComponentResponse(
  stdout: Writable,
  result: IncidentComponentResponse,
  action: "created" | "updated",
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Incident component ${action}\n`);
  printIncidentComponentFields(stdout, result.component);
}

function printJson(stdout: Writable, value: unknown): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function printIncidentFields(stdout: Writable, incident: Incident): void {
  stdout.write(`ID: ${incident.id}\n`);
  stdout.write(`State: ${incident.state}\n`);
  stdout.write(`Severity: ${incident.severity}\n`);
  stdout.write(
    `Repository: ${formatValue(incident.repositoryFullName, 255)}\n`,
  );
  stdout.write(`Title: ${formatValue(incident.title, 300)}\n`);
  stdout.write(`Summary: ${formatValue(incident.summary, 10_000)}\n`);
  stdout.write(`Started: ${incident.startedAt ?? "(none)"}\n`);
  stdout.write(`Detected: ${incident.detectedAt ?? "(none)"}\n`);
  stdout.write(`Mitigated: ${incident.mitigatedAt ?? "(none)"}\n`);
  stdout.write(
    `Resolution: ${formatValue(incident.resolutionSummary ?? "(none)", 10_000)}\n`,
  );
  stdout.write(`Created: ${incident.createdAt}\n`);
  stdout.write(`Updated: ${incident.updatedAt}\n`);
  stdout.write(`Resolved: ${incident.resolvedAt ?? "(none)"}\n`);
  stdout.write(`Impacts: ${incident.impacts.length}\n`);
  for (const impact of incident.impacts) {
    const component = impact.component;
    stdout.write(
      `Impact: ${
        component === null
          ? "System"
          : `${formatValue(component.name, 120)} (${component.id})`
      } - ${impact.condition}\n`,
    );
  }
  stdout.write(
    `Created by: ${formatAttribution(incident.createdBy, incident.createdByUserId)}\n`,
  );
  stdout.write(
    `Updated by: ${formatAttribution(incident.updatedBy, incident.updatedByUserId)}\n`,
  );
}

function printIncidentComponentFields(
  stdout: Writable,
  component: IncidentComponent,
): void {
  stdout.write(`ID: ${component.id}\n`);
  stdout.write(`Name: ${formatValue(component.name, 120)}\n`);
  stdout.write(
    `Description: ${formatValue(component.description ?? "(none)", 1_000)}\n`,
  );
  stdout.write(`Created: ${component.createdAt}\n`);
  stdout.write(`Updated: ${component.updatedAt}\n`);
  stdout.write(`Archived: ${component.archivedAt ?? "(none)"}\n`);
}

function printIncidentNote(stdout: Writable, note: IncidentNote): void {
  stdout.write(`Note ID: ${note.id}\n`);
  stdout.write(`Incident ID: ${note.incidentId}\n`);
  stdout.write(`Created: ${note.createdAt}\n`);
  stdout.write(`Updated: ${note.updatedAt}\n`);
  stdout.write(`Created by: ${formatActor(note.createdBy)}\n`);
  stdout.write(`Updated by: ${formatActor(note.updatedBy)}\n`);
  stdout.write("Body:\n");
  stdout.write(`${formatMultilineValue(note.body)}\n`);
}

function formatIncidentRow(incident: Incident): string {
  return formatRow({
    id: incident.id,
    state: incident.state,
    severity: incident.severity,
    repository: incident.repositoryFullName,
    title: incident.title,
    updatedAt: incident.updatedAt,
  });
}

function formatRow(values: Record<keyof typeof columnWidths, string>): string {
  return (
    (Object.keys(columnWidths) as Array<keyof typeof columnWidths>)
      .map((key) => formatColumn(values[key], columnWidths[key]))
      .join("  ") + "\n"
  );
}

function formatComponentRow(
  values: Record<keyof typeof componentColumnWidths, string>,
): string {
  return (
    (
      Object.keys(componentColumnWidths) as Array<
        keyof typeof componentColumnWidths
      >
    )
      .map((key) => formatColumn(values[key], componentColumnWidths[key]))
      .join("  ") + "\n"
  );
}

function formatColumn(value: string, width: number): string {
  const safe = formatValue(value, width);
  const bounded =
    safe.length <= width ? safe : `${safe.slice(0, width - 3)}...`;
  return bounded.padEnd(width);
}

function formatActor(actor: IncidentNote["createdBy"]): string {
  if (actor == null) return "(unknown)";
  return `${formatTerminalValue(actor.name)} (${actor.id})`;
}

function formatAttribution(
  actor: Incident["createdBy"],
  userId: string | null,
): string {
  return actor === null ? (userId ?? "(unknown)") : formatActor(actor);
}

function formatValue(value: string, maximumLength: number): string {
  const safe = formatTerminalValue(value);
  return safe.length <= maximumLength
    ? safe
    : `${safe.slice(0, maximumLength - 3)}...`;
}

function formatMultilineValue(value: string): string {
  return value
    .split(/\r\n|\r|\n/u)
    .map(formatTerminalValue)
    .join("\n");
}

function formatTerminalValue(value: string): string {
  let safe = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    safe +=
      codePoint != null &&
      (codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
        ? " "
        : character;
  }
  return safe;
}
