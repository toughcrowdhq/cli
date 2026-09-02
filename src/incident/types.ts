export const incidentSeverities = [
  "p0",
  "p1",
  "p2",
  "p3",
  "unclassified",
] as const;
export type IncidentSeverity = (typeof incidentSeverities)[number];

export const incidentStates = ["active", "resolved"] as const;
export type IncidentState = (typeof incidentStates)[number];

export interface IncidentActor {
  id: string;
  name: string;
}

export interface Incident {
  id: string;
  repositoryFullName: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  state: IncidentState;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface IncidentNote {
  id: string;
  incidentId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: IncidentActor | null;
  updatedBy: IncidentActor | null;
}

export interface IncidentResponse {
  incident: Incident;
}

export interface IncidentList {
  incidents: readonly Incident[];
  nextCursor: string | null;
}

export interface IncidentNotesPage {
  notes: readonly IncidentNote[];
  nextCursor: string | null;
}

export interface IncidentDetail {
  incident: Incident;
  notes: readonly IncidentNote[];
  nextCursor: string | null;
}

export interface IncidentNoteResponse {
  note: IncidentNote;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isIncidentId(value: string): boolean {
  return uuidPattern.test(value);
}

export function decodeIncidentResponse(value: unknown): IncidentResponse {
  if (!isRecord(value)) throw new TypeError("incident response is invalid");
  return { incident: decodeIncident(value.incident) };
}

export function decodeIncidentList(value: unknown): IncidentList {
  if (!isRecord(value) || !Array.isArray(value.incidents)) {
    throw new TypeError("incident list response is invalid");
  }
  const incidents = value.incidents.map(decodeIncident);
  const nextCursor = readNullableString(value.nextCursor, 512);
  if (
    nextCursor === undefined ||
    new Set(incidents.map((incident) => incident.id)).size !== incidents.length
  ) {
    throw new TypeError("incident list response is invalid");
  }
  return { incidents, nextCursor };
}

export function decodeIncidentNotesPage(value: unknown): IncidentNotesPage {
  if (!isRecord(value) || !Array.isArray(value.notes)) {
    throw new TypeError("incident notes response is invalid");
  }
  const notes = value.notes.map(decodeIncidentNote);
  const nextCursor = readNullableString(value.nextCursor, 512);
  if (
    nextCursor === undefined ||
    new Set(notes.map((note) => note.id)).size !== notes.length
  ) {
    throw new TypeError("incident notes response is invalid");
  }
  return { notes, nextCursor };
}

export function decodeIncidentNoteResponse(
  value: unknown,
): IncidentNoteResponse {
  if (!isRecord(value)) {
    throw new TypeError("incident note response is invalid");
  }
  return { note: decodeIncidentNote(value.note) };
}

function decodeIncident(value: unknown): Incident {
  if (!isRecord(value)) throw new TypeError("incident is invalid");
  const severity = readChoice(value.severity, incidentSeverities);
  const state = readChoice(value.state, incidentStates);
  const resolutionSummary = readNullableString(value.resolutionSummary, 10_000);
  const resolvedAt = readNullableTimestamp(value.resolvedAt);
  if (
    severity == null ||
    state == null ||
    resolutionSummary === undefined ||
    resolvedAt === undefined
  ) {
    throw new TypeError("incident is invalid");
  }
  return {
    id: readUuid(value.id),
    repositoryFullName: readString(value.repositoryFullName, 255, false),
    createdByUserId: readNullableUuid(value.createdByUserId),
    updatedByUserId: readNullableUuid(value.updatedByUserId),
    title: readString(value.title, 300, false),
    summary: readString(value.summary, 10_000, false),
    severity,
    state,
    resolutionSummary,
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
    resolvedAt,
  };
}

function decodeIncidentNote(value: unknown): IncidentNote {
  if (!isRecord(value)) throw new TypeError("incident note is invalid");
  return {
    id: readUuid(value.id),
    incidentId: readUuid(value.incidentId),
    body: readString(value.body, 10_000, false),
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
    createdBy: decodeNullableActor(value.createdBy),
    updatedBy: decodeNullableActor(value.updatedBy),
  };
}

function decodeNullableActor(value: unknown): IncidentActor | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new TypeError("incident actor is invalid");
  return {
    id: readUuid(value.id),
    name: readString(value.name, 500, false),
  };
}

function readNullableString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.length <= maximumLength
    ? value
    : undefined;
}

function readString(
  value: unknown,
  maximumLength: number,
  allowEmpty: boolean,
): string {
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    throw new TypeError("string field is invalid");
  }
  return value;
}

function readUuid(value: unknown): string {
  const text = readString(value, 36, false);
  if (!uuidPattern.test(text)) throw new TypeError("UUID field is invalid");
  return text;
}

function readTimestamp(value: unknown): string {
  const text = readString(value, 80, false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(text)) {
    throw new TypeError("timestamp field is invalid");
  }
  try {
    new Date(text).toISOString();
  } catch {
    throw new TypeError("timestamp field is invalid");
  }
  return text;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return readTimestamp(value);
}

function readNullableUuid(value: unknown): string | null {
  return value === null ? null : readUuid(value);
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] | null {
  return typeof value === "string" && choices.includes(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
