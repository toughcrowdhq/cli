import { requestJson, type RequestJsonOptions } from "../api/request.js";

export interface StartedCliAuthorization {
  authorizationUrl: string;
  expiresAt: string;
}

export interface ExchangedCliAuthorization {
  apiKey: string;
  key: {
    id: string;
    name: string;
    createdAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface AuthorizationRequestOptions {
  apiOrigin: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<unknown>["fetch"];
  timers?: RequestJsonOptions<unknown>["timers"];
}

export interface StartCliAuthorizationOptions extends AuthorizationRequestOptions {
  callbackUri: string;
  codeChallenge: string;
  state: string;
  clientName: string;
}

export interface ExchangeCliAuthorizationOptions extends AuthorizationRequestOptions {
  code: string;
  codeVerifier: string;
}

export function startCliAuthorization(
  options: StartCliAuthorizationOptions,
): Promise<StartedCliAuthorization> {
  return requestJson({
    origin: options.apiOrigin,
    method: "POST",
    path: "/api/cli-authorizations",
    body: {
      callbackUri: options.callbackUri,
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: "S256",
      state: options.state,
      clientName: options.clientName,
    },
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeStartedCliAuthorization,
  });
}

export function exchangeCliAuthorization(
  options: ExchangeCliAuthorizationOptions,
): Promise<ExchangedCliAuthorization> {
  return requestJson({
    origin: options.apiOrigin,
    method: "POST",
    path: "/api/cli-authorizations/exchange",
    body: {
      code: options.code,
      codeVerifier: options.codeVerifier,
    },
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeExchangedCliAuthorization,
  });
}

export function decodeStartedCliAuthorization(
  value: unknown,
): StartedCliAuthorization {
  if (!isRecord(value)) {
    throw new TypeError("authorization response must be an object");
  }

  const authorizationUrl = readAuthorizationUrl(value.authorizationUrl);
  const expiresAt = readIsoTimestamp(value.expiresAt);
  if (authorizationUrl == null || expiresAt == null) {
    throw new TypeError("authorization response is invalid");
  }

  return { authorizationUrl, expiresAt };
}

export function decodeExchangedCliAuthorization(
  value: unknown,
): ExchangedCliAuthorization {
  if (!isRecord(value) || !isRecord(value.apiKey) || !isRecord(value.user)) {
    throw new TypeError("authorization exchange response is invalid");
  }

  // The public API calls the secret string `key` and its metadata object
  // `apiKey`. Normalize those wire names to the CLI's `apiKey` and `key`
  // fields at this boundary.
  const apiKey = readApiKey(value.key);
  const keyId = readUuid(value.apiKey.id);
  const keyName = readBoundedString(value.apiKey.name, 200);
  const keyCreatedAt = readIsoTimestamp(value.apiKey.createdAt);
  const userId = readUuid(value.user.id);
  const userName = readBoundedString(value.user.name, 200);
  const userEmail = readBoundedString(value.user.email, 320);

  if (
    apiKey == null ||
    keyId == null ||
    keyName == null ||
    keyCreatedAt == null ||
    userId == null ||
    userName == null ||
    userEmail == null
  ) {
    throw new TypeError("authorization exchange response is invalid");
  }

  return {
    apiKey,
    key: { id: keyId, name: keyName, createdAt: keyCreatedAt },
    user: { id: userId, name: userName, email: userEmail },
  };
}

function readAuthorizationUrl(value: unknown): string | null {
  const text = readBoundedString(value, 2_048);
  if (text == null) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }

  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) return null;

  return text;
}

function readApiKey(value: unknown): string | null {
  const text = readBoundedString(value, 200);
  if (text == null) return null;

  return /^tc_key_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{43}$/.test(text)
    ? text
    : null;
}

function readUuid(value: unknown): string | null {
  const text = readBoundedString(value, 36);
  if (text == null) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : null;
}

function readIsoTimestamp(value: unknown): string | null {
  const text = readBoundedString(value, 80);
  if (text == null) return null;

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toISOString() === text ? text : null;
}

function readBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > maxLength) return null;

  return value;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname.toLowerCase() === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
