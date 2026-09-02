import { requestJson, type RequestJsonOptions } from "../api/request.js";
import {
  decodeIncidentList,
  decodeIncidentNotesPage,
  decodeIncidentNoteResponse,
  decodeIncidentResponse,
  type IncidentList,
  type IncidentNoteResponse,
  type IncidentNotesPage,
  type IncidentResponse,
  type IncidentSeverity,
  type IncidentState,
} from "./types.js";

interface IncidentApiRuntime<T> {
  apiOrigin: string;
  authorization: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<T>["fetch"];
  timers?: RequestJsonOptions<T>["timers"];
}

export interface ListIncidentsRequest {
  state?: IncidentState;
  severity?: IncidentSeverity;
  repo?: string;
  limit?: number;
  cursor?: string;
}

export function listIncidents(
  options: IncidentApiRuntime<IncidentList> & ListIncidentsRequest,
): Promise<IncidentList> {
  const query = new URLSearchParams();
  if (options.state != null) query.set("state", options.state);
  if (options.severity != null) query.set("severity", options.severity);
  if (options.repo != null) {
    query.set("repositoryFullName", options.repo);
  }
  if (options.limit != null) query.set("limit", String(options.limit));
  if (options.cursor != null) query.set("cursor", options.cursor);
  return incidentRequest(options, {
    method: "GET",
    path: withQuery("/api/incidents", query),
    decode: decodeIncidentList,
  });
}

export interface CreateIncidentRequest {
  summary: string;
  title: string;
  repo?: string;
  severity?: IncidentSeverity;
  state?: IncidentState;
  resolutionSummary?: string;
}

export function createIncident(
  options: IncidentApiRuntime<IncidentResponse> & CreateIncidentRequest,
): Promise<IncidentResponse> {
  return incidentRequest(options, {
    method: "POST",
    path: "/api/incidents",
    body: {
      summary: options.summary,
      title: options.title,
      ...(options.repo == null ? {} : { repositoryFullName: options.repo }),
      ...(options.severity == null ? {} : { severity: options.severity }),
      ...(options.state == null ? {} : { state: options.state }),
      ...(options.resolutionSummary == null
        ? {}
        : { resolutionSummary: options.resolutionSummary }),
    },
    decode: decodeIncidentResponse,
  });
}

export function getIncident(
  options: IncidentApiRuntime<IncidentResponse> & { incidentId: string },
): Promise<IncidentResponse> {
  return incidentRequest(options, {
    method: "GET",
    path: incidentPath(options.incidentId),
    decode: decodeIncidentResponse,
  });
}

export interface ListIncidentNotesRequest {
  incidentId: string;
  limit?: number;
  cursor?: string;
}

export function listIncidentNotes(
  options: IncidentApiRuntime<IncidentNotesPage> & ListIncidentNotesRequest,
): Promise<IncidentNotesPage> {
  const query = new URLSearchParams();
  if (options.limit != null) query.set("limit", String(options.limit));
  if (options.cursor != null) query.set("cursor", options.cursor);
  return incidentRequest(options, {
    method: "GET",
    path: withQuery(`${incidentPath(options.incidentId)}/notes`, query),
    decode: decodeIncidentNotesPage,
  });
}

export interface UpdateIncidentRequest {
  incidentId: string;
  repo?: string;
  title?: string;
  summary?: string;
  severity?: IncidentSeverity;
  state?: IncidentState;
  resolutionSummary?: string;
}

export function updateIncident(
  options: IncidentApiRuntime<IncidentResponse> & UpdateIncidentRequest,
): Promise<IncidentResponse> {
  return incidentRequest(options, {
    method: "PATCH",
    path: incidentPath(options.incidentId),
    body: {
      ...(options.repo == null ? {} : { repositoryFullName: options.repo }),
      ...(options.title == null ? {} : { title: options.title }),
      ...(options.summary == null ? {} : { summary: options.summary }),
      ...(options.severity == null ? {} : { severity: options.severity }),
      ...(options.state == null ? {} : { state: options.state }),
      ...(options.resolutionSummary == null
        ? {}
        : { resolutionSummary: options.resolutionSummary }),
    },
    decode: decodeIncidentResponse,
  });
}

export interface CreateIncidentNoteRequest {
  incidentId: string;
  body: string;
}

export function createIncidentNote(
  options: IncidentApiRuntime<IncidentNoteResponse> & CreateIncidentNoteRequest,
): Promise<IncidentNoteResponse> {
  return incidentRequest(options, {
    method: "POST",
    path: `${incidentPath(options.incidentId)}/notes`,
    body: { body: options.body },
    decode: decodeIncidentNoteResponse,
  });
}

export interface UpdateIncidentNoteRequest {
  incidentId: string;
  noteId: string;
  body: string;
}

export function updateIncidentNote(
  options: IncidentApiRuntime<IncidentNoteResponse> & UpdateIncidentNoteRequest,
): Promise<IncidentNoteResponse> {
  return incidentRequest(options, {
    method: "PATCH",
    path: `${incidentPath(options.incidentId)}/notes/${encodeURIComponent(
      options.noteId,
    )}`,
    body: { body: options.body },
    decode: decodeIncidentNoteResponse,
  });
}

function incidentRequest<T>(
  runtime: IncidentApiRuntime<T>,
  options: Omit<
    RequestJsonOptions<T>,
    "origin" | "authorization" | "signal" | "fetch" | "timers" | "metadata"
  >,
): Promise<T> {
  return requestJson({
    origin: runtime.apiOrigin,
    authorization: runtime.authorization,
    signal: runtime.signal,
    fetch: runtime.fetch,
    timers: runtime.timers,
    metadata: { cliVersion: runtime.version },
    ...options,
  });
}

function incidentPath(incidentId: string): string {
  return `/api/incidents/${encodeURIComponent(incidentId)}`;
}

function withQuery(path: string, query: URLSearchParams): string {
  const serialized = query.toString();
  return serialized.length === 0 ? path : `${path}?${serialized}`;
}
