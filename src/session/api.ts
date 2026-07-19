import { requestJson, type RequestJsonOptions } from "../api/request.js";
import {
  decodeSessionList,
  type SessionList,
  type SessionStatusFilter,
} from "./types.js";

export interface ListSessionsRequest {
  status?: SessionStatusFilter;
  repo?: string;
  limit?: number;
  cursor?: string;
}

export interface ListSessionsOptions extends ListSessionsRequest {
  apiOrigin: string;
  authorization: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<SessionList>["fetch"];
  timers?: RequestJsonOptions<SessionList>["timers"];
}

export function listSessions(
  options: ListSessionsOptions,
): Promise<SessionList> {
  return requestJson({
    origin: options.apiOrigin,
    method: "GET",
    path: buildListSessionsPath(options),
    authorization: options.authorization,
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeSessionList,
  });
}

export function buildListSessionsPath(options: ListSessionsRequest): string {
  const query = new URLSearchParams();

  if (options.status != null) query.set("status", options.status);
  if (options.repo != null) query.set("repository", options.repo);
  if (options.limit != null) query.set("limit", String(options.limit));
  if (options.cursor != null) query.set("cursor", options.cursor);

  const encoded = query.toString();
  return encoded.length === 0 ? "/api/sessions" : `/api/sessions?${encoded}`;
}
