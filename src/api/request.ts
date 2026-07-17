import { randomUUID } from "node:crypto";
import { ApiClientError, decodeApiErrorEnvelope } from "./errors.js";
import { defaultApiOrigin, parseApiOrigin } from "./origin.js";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ResponseDecoder<T> = (value: unknown) => T;

export interface FetchLike {
  (input: URL, init: RequestInit): Promise<Response>;
}

export interface TimerCapabilities {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timeoutId: unknown): void;
}

export interface ClientMetadata {
  cliName: string;
  cliVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface RequestJsonOptions<T> {
  origin?: string;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  authorization: string;
  body?: JsonValue;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  metadata?: Partial<ClientMetadata>;
  decode: ResponseDecoder<T>;
}

const defaultTimeoutMs = 30_000;
const jsonContentType = "application/json";
const requestIdHeader = "x-request-id";

export async function requestJson<T>(
  options: RequestJsonOptions<T>,
): Promise<T> {
  const origin = parseApiOrigin(options.origin ?? defaultApiOrigin);
  const url = createApiUrl(origin, options.path);
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("API request timeout must be greater than zero");
  }

  const timeoutController = new AbortController();
  const signal = combineSignals(options.signal, timeoutController.signal);
  const timers = options.timers ?? globalTimerCapabilities;
  const timeoutId = timers.setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  try {
    const response = await callFetch(options.fetch ?? fetch, url, {
      method: options.method,
      redirect: "manual",
      headers: createHeaders(options, options.requestId ?? randomUUID()),
      signal,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });

    if (response.ok) {
      return await decodeSuccessResponse(response, options.decode);
    }

    return await decodeErrorResponse(response);
  } catch (error) {
    throw classifyFetchFailure(error, timeoutController.signal, options.signal);
  } finally {
    timers.clearTimeout(timeoutId);
  }
}

function createApiUrl(origin: string, path: string): URL {
  if (!path.startsWith("/api/")) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API request path must begin with /api/",
    });
  }

  const url = new URL(path, origin);
  if (url.origin !== origin || `${url.pathname}${url.search}` !== path) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API request path must not change the API origin",
    });
  }

  return url;
}

function createHeaders(
  options: RequestJsonOptions<unknown>,
  requestId: string,
): Headers {
  const metadata = createClientMetadata(options.metadata);
  const headers = new Headers({
    accept: jsonContentType,
    authorization: options.authorization,
    "user-agent": `${metadata.cliName}/${metadata.cliVersion} node/${metadata.nodeVersion} ${metadata.platform}/${metadata.arch}`,
    "x-toughcrowd-client": `${metadata.cliName}/${metadata.cliVersion}`,
    "x-request-id": requestId,
    "x-toughcrowd-runtime": `node/${metadata.nodeVersion}; ${metadata.platform}; ${metadata.arch}`,
  });

  if (options.body !== undefined) {
    headers.set("content-type", jsonContentType);
  }

  if (options.idempotencyKey != null) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  return headers;
}

function createClientMetadata(
  overrides: Partial<ClientMetadata> = {},
): ClientMetadata {
  return {
    cliName: overrides.cliName ?? "@toughcrowd/cli",
    cliVersion: overrides.cliVersion ?? "0.0.0",
    nodeVersion: overrides.nodeVersion ?? process.versions.node,
    platform: overrides.platform ?? process.platform,
    arch: overrides.arch ?? process.arch,
  };
}

function callFetch(
  fetchImplementation: FetchLike,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  return fetchImplementation(url, init);
}

async function decodeSuccessResponse<T>(
  response: Response,
  decode: ResponseDecoder<T>,
): Promise<T> {
  assertJsonResponse(response);

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API response body was not valid JSON",
      status: response.status,
      requestId: readHeader(response, requestIdHeader),
      cause: error,
    });
  }

  try {
    return decode(value);
  } catch (error) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API response did not match the expected shape",
      status: response.status,
      requestId: readHeader(response, requestIdHeader),
      cause: error,
    });
  }
}

async function decodeErrorResponse(response: Response): Promise<never> {
  const requestId = readHeader(response, requestIdHeader);

  if (!isJsonResponse(response)) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API error response did not use JSON",
      status: response.status,
      requestId,
    });
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API error response body was not valid JSON",
      status: response.status,
      requestId,
      cause: error,
    });
  }

  const envelope = decodeApiErrorEnvelope(value);
  if (envelope == null) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API error response did not match the expected shape",
      status: response.status,
      requestId,
    });
  }

  throw new ApiClientError({
    kind: "api",
    message: envelope.error.message,
    status: response.status,
    code: envelope.error.code,
    requestId: envelope.requestId ?? requestId,
    fields: envelope.error.fields,
  });
}

function assertJsonResponse(response: Response): void {
  if (!isJsonResponse(response)) {
    throw new ApiClientError({
      kind: "malformed-response",
      message: "API response did not use JSON",
      status: response.status,
      requestId: readHeader(response, requestIdHeader),
    });
  }
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase();

  return (
    contentType != null &&
    (contentType.split(";")[0].trim() === jsonContentType ||
      contentType.includes("+json"))
  );
}

function combineSignals(
  commandSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (commandSignal == null) return timeoutSignal;

  return AbortSignal.any([commandSignal, timeoutSignal]);
}

function classifyFetchFailure(
  error: unknown,
  timeoutSignal: AbortSignal,
  commandSignal: AbortSignal | undefined,
): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (commandSignal?.aborted) {
    return new ApiClientError({
      kind: "canceled",
      message: "API request was canceled",
      cause: error,
    });
  }

  if (timeoutSignal.aborted) {
    return new ApiClientError({
      kind: "timeout",
      message: "API request timed out",
      cause: error,
    });
  }

  return new ApiClientError({
    kind: "network",
    message: "API request failed before a response was received",
    cause: error,
  });
}

function readHeader(response: Response, name: string): string | undefined {
  return response.headers.get(name) ?? undefined;
}

const globalTimerCapabilities: TimerCapabilities = {
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(timeoutId) {
    clearTimeout(timeoutId as NodeJS.Timeout);
  },
};
