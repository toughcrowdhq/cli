import type {
  Incident,
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

function printJson(stdout: Writable, value: unknown): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function printIncidentFields(stdout: Writable, incident: Incident): void {
  stdout.write(`ID: ${incident.id}\n`);
  stdout.write(`State: ${incident.state}\n`);
  stdout.write(`Severity: ${incident.severity}\n`);
  stdout.write(
    `Repository: ${formatValue(incident.repository ?? "(none)", 255)}\n`,
  );
  stdout.write(`Title: ${formatValue(incident.title, 300)}\n`);
  stdout.write(`Summary: ${formatValue(incident.summary, 10_000)}\n`);
  stdout.write(
    `Resolution: ${formatValue(incident.resolutionSummary ?? "(none)", 10_000)}\n`,
  );
  stdout.write(`Created: ${incident.createdAt}\n`);
  stdout.write(`Updated: ${incident.updatedAt}\n`);
  stdout.write(`Resolved: ${incident.resolvedAt ?? "(none)"}\n`);
  stdout.write(`Created by: ${formatActor(incident.createdBy)}\n`);
  stdout.write(`Updated by: ${formatActor(incident.updatedBy)}\n`);
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
    repository: incident.repository ?? "(none)",
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

function formatColumn(value: string, width: number): string {
  const safe = formatValue(value, width);
  const bounded =
    safe.length <= width ? safe : `${safe.slice(0, width - 3)}...`;
  return bounded.padEnd(width);
}

function formatActor(actor: Incident["createdBy"]): string {
  if (actor == null) return "(unknown)";
  return `${formatTerminalValue(actor.name)} (${actor.id})`;
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
